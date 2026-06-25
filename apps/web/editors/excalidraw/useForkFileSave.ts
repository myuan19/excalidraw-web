import { useCallback } from "react";

import { executeCheckpointSave } from "../../data/checkpointSaveOrchestrator";
import { FileSyncState } from "../../data/FileSyncState";
import { canonicalizeExcalidrawSceneFileName } from "../../data/excalidrawFileNameAuthority";
import { mergeAppStateWithServerFileName } from "../../data/forkFileScene";
import { resolveSaveDisplayName } from "../../data/forkFileNaming";
import { ServerSync } from "../../data/ServerSync";
import { hashDocumentSnapshot } from "../../data/sceneHash";

import type { SaveToServerSource } from "../../hooks/types";

type ForkSaveSource = "manual" | "visibility" | "auto" | "exit" | "thumbnail";
type ForkSaveOptions = {
  forceOverwrite?: boolean;
};

function toSaveToServerSource(source: ForkSaveSource): SaveToServerSource {
  if (source === "manual") {
    return "sidebar";
  }
  if (source === "exit") {
    return "home";
  }
  return source;
}

export function useForkFileSave(fileId: string | null) {
  return useCallback(
    async (
      data: unknown,
      source: ForkSaveSource = "manual",
      name?: string,
      thumbnail?: string | null,
      opts?: ForkSaveOptions,
    ) => {
      if (!fileId) {
        return null;
      }
      const saveData = canonicalizeExcalidrawSceneFileName(
        fileId,
        data as { appState?: unknown },
      );
      let putResult = null as Awaited<
        ReturnType<typeof ServerSync.saveFileImmediate>
      > | null;
      const outcome = await executeCheckpointSave(
        {
          fileId,
          source: toSaveToServerSource(source),
          contentHash: hashDocumentSnapshot(saveData),
          baselineHash: FileSyncState.getBaselineHash(fileId),
          forceThumbnail: source === "thumbnail" && thumbnail !== undefined,
          document: saveData,
          displayName: name,
        },
        {
          resolveFileThumbnailForPut: async () => thumbnail,
          putDocument: async ({
            thumbnail: resolvedThumbnail,
            checkpointPolicy,
          }) => {
            const displayName = await resolveSaveDisplayName(fileId);
            const putData = {
              ...saveData,
              appState: mergeAppStateWithServerFileName(
                saveData.appState,
                displayName,
              ),
            };
            putResult = await ServerSync.saveFileImmediate(
              fileId,
              putData,
              displayName,
              resolvedThumbnail,
              {
                checkpointPolicy,
                forceOverwrite: opts?.forceOverwrite,
                source,
              },
            );
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
    [fileId],
  );
}
