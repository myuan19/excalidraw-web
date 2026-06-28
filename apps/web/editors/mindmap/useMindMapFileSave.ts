import { useCallback } from "react";

import { executeCheckpointSave } from "../../data/checkpointSaveOrchestrator";
import { FileSyncState } from "../../data/FileSyncState";
import {
  readMindMapTraceFileState,
  summarizeMindMapTraceDocument,
  traceMindMapOperation,
} from "../../data/mindMapOperationTrace";
import { ServerSync } from "../../data/ServerSync";
import { saveMindMapBrowserViewFromData } from "../../data/mindMapBrowserViewStorage";
import { hashDocumentSnapshot } from "../../data/sceneHash";

import { toMindMapLocalCacheRecord as buildMindMapLocalCacheRecord } from "./mindMapLocalCacheRecord";
import { resolveMindMapSaveDisplayName } from "./mindMapRootNamePolicy";

import type { ManagedDocument } from "../../data/documentTypes";
import type { MindMapDocumentData } from "../../data/formats/MindMapAdapter";
import type { SaveToServerSource } from "../../hooks/types";
import type { MindMapSaveDocument } from "./mindMapDraftState";

type MindMapSaveSource =
  | "manual"
  | "auto"
  | "visibility"
  | "exit"
  | "thumbnail";
type MindMapSaveOptions = {
  forceOverwrite?: boolean;
};

function toSaveToServerSource(source: MindMapSaveSource): SaveToServerSource {
  if (source === "manual") {
    return "sidebar";
  }
  if (source === "exit") {
    return "home";
  }
  return source;
}

export function toMindMapLocalCacheRecord(
  document: MindMapSaveDocument,
  serverContentSha256?: string | null,
  serverVersion?: number | null,
) {
  return buildMindMapLocalCacheRecord(
    document,
    serverContentSha256 ?? undefined,
    serverVersion,
  );
}

export function getCachedMindMapDocument(
  fileId: string,
): MindMapSaveDocument | null {
  const cache = FileSyncState.getLocalCache(fileId);
  const document = cache?.document;
  if (!document || document.kind !== "mindmap") {
    return null;
  }
  saveMindMapBrowserViewFromData(fileId, document);
  const record = buildMindMapLocalCacheRecord(
    document as MindMapSaveDocument,
    cache?.meta?.serverContentSha256,
  );
  FileSyncState.setLocalCache(fileId, record);
  return record.document;
}

export function useMindMapFileSave(
  fileId: string | null,
  baseline: string | null,
) {
  return useCallback(
    async (
      document: ManagedDocument<MindMapDocumentData>,
      source: MindMapSaveSource = "manual",
      name?: string,
      thumbnail?: string | null,
      opts?: MindMapSaveOptions,
    ) => {
      if (!fileId) {
        return null;
      }
      if (source === "thumbnail") {
        if (!thumbnail) {
          traceMindMapOperation("fileSave.thumbnail.skipNoThumbnail", {
            fileId8: fileId.slice(0, 8),
            source,
            document: summarizeMindMapTraceDocument(document),
            fileState: readMindMapTraceFileState(fileId),
          });
          return null;
        }
        traceMindMapOperation("fileSave.thumbnail.request", {
          fileId8: fileId.slice(0, 8),
          source,
          svgLen: thumbnail.length,
          document: summarizeMindMapTraceDocument(document),
          fileStateBefore: readMindMapTraceFileState(fileId),
        });
        const thumbnailResult = await ServerSync.saveThumbnailOnly(
          fileId,
          thumbnail,
          resolveMindMapSaveDisplayName(document.data, name),
        );
        traceMindMapOperation("fileSave.thumbnail.after", {
          fileId8: fileId.slice(0, 8),
          source,
          ok: !!thumbnailResult,
          skipped: !!thumbnailResult?.skipped,
          serverContentSha256: thumbnailResult?.content_sha256 ?? null,
          fileStateAfter: readMindMapTraceFileState(fileId),
        });
        return thumbnailResult;
      }
      const displayName = resolveMindMapSaveDisplayName(document.data, name);
      let putResult = null as Awaited<
        ReturnType<typeof ServerSync.saveFileImmediate>
      > | null;
      const outcome = await executeCheckpointSave(
        {
          fileId,
          source: toSaveToServerSource(source),
          contentHash: hashDocumentSnapshot(document),
          baselineHash: FileSyncState.getBaselineHash(fileId) ?? baseline,
          document,
          displayName,
        },
        {
          resolveFileThumbnailForPut: async () => thumbnail ?? undefined,
          putDocument: async ({
            thumbnail: resolvedThumbnail,
            checkpointPolicy,
          }) => {
            traceMindMapOperation("fileSave.server.putDocument.request", {
              fileId8: fileId.slice(0, 8),
              source,
              checkpointPolicy,
              displayName,
              hasThumbnail:
                typeof resolvedThumbnail === "string" &&
                resolvedThumbnail.length > 0,
              document: summarizeMindMapTraceDocument(document),
              fileStateBeforePut: readMindMapTraceFileState(fileId),
            });
            putResult = await ServerSync.saveFileImmediate(
              fileId,
              document,
              displayName,
              resolvedThumbnail,
              {
                checkpointPolicy,
                forceOverwrite: opts?.forceOverwrite,
                source,
              },
            );
            traceMindMapOperation("fileSave.server.putDocument.after", {
              fileId8: fileId.slice(0, 8),
              source,
              ok: !!putResult,
              skipped: !!putResult?.skipped,
              serverContentSha256: putResult?.content_sha256 ?? null,
              fileStateAfterPut: readMindMapTraceFileState(fileId),
            });
            return putResult;
          },
        },
      );
      return (
        putResult ?? {
          ok: true,
          skipped: true,
          content_sha256: FileSyncState.getServerHash(fileId) ?? undefined,
          updated_at: outcome.updatedAt ?? undefined,
        }
      );
    },
    [baseline, fileId],
  );
}
