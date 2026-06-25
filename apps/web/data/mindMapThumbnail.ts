import { createLogger } from "../lib/logger";
import { devDebug } from "../lib/devDebug";
import { generateMindMapThumbnailAndCache as generateNativeMindMapThumbnailAndCache } from "../editors/mindmap/mindMapNativeThumbnailRenderer";

import { FileSyncState } from "./FileSyncState";
import { isLocalDraftFileId } from "./localDraftFileId";
import {
  readMindMapTraceFileState,
  summarizeMindMapTraceDocument,
  traceMindMapOperation,
} from "./mindMapOperationTrace";
import { hashDocumentSnapshot } from "./sceneHash";
import {
  cacheDraftThumbnailIfVisible,
  finalizeSavedThumbnail,
} from "./thumbnailLifecycle";
import {
  decodeMindMapThumbnailPayload,
  isNativeMindMapThumbnailSvg,
  normalizeMindMapThumbnailSvg,
} from "./thumbnailSvg";
import { ServerSync } from "./ServerSync";
import { clearThumbnailServerMiss } from "./thumbnailServerFetchMiss";

import type { ManagedDocument } from "./documentTypes";
import type { MindMapDocumentData } from "./formats/MindMapAdapter";

const logThumb = createLogger({ module: "thumbnail" });

function debugMindMapThumb(label: string, data: Record<string, unknown>): void {
  devDebug("mindmap-thumbnail", `[DEBUG] ${label}`, data);
  logThumb.debug(label, data);
}

/** iframe native export → 聚焦 viewBox 后写入本地缓存与服务端 thumbnail.svg */
export async function persistNativeMindMapThumbnail(
  fileId: string,
  rawSvg: string,
  document?: ManagedDocument<MindMapDocumentData> | null,
  name?: string,
): Promise<string | undefined> {
  try {
    const thumbnail =
      decodeMindMapThumbnailPayload(rawSvg) ??
      normalizeMindMapThumbnailSvg(rawSvg, { source: "native" });
    if (document) {
      cacheDraftThumbnailIfVisible(
        fileId,
        "mindmap",
        thumbnail,
        hashDocumentSnapshot(document),
      );
    }
    traceMindMapOperation("thumbnail.persistNative.localCacheSet", {
      fileId8: fileId.slice(0, 8),
      svgLen: thumbnail.length,
      hasDocument: !!document,
      document: summarizeMindMapTraceDocument(document),
      fileStateAfterLocalThumb: readMindMapTraceFileState(fileId),
    });
    debugMindMapThumb("persistNativeMindMapThumbnail | local cache set", {
      fileId8: fileId.slice(0, 8),
      svgLen: thumbnail.length,
      hasDocument: !!document,
      isNative: isNativeMindMapThumbnailSvg(thumbnail),
    });

    if (isLocalDraftFileId(fileId)) {
      traceMindMapOperation("thumbnail.persistNative.skipLocalDraftServer", {
        fileId8: fileId.slice(0, 8),
        svgLen: thumbnail.length,
        fileState: readMindMapTraceFileState(fileId),
      });
      return thumbnail;
    }

    if (FileSyncState.hasUnsavedChanges(fileId)) {
      traceMindMapOperation("thumbnail.persistNative.skipDirtyServer", {
        fileId8: fileId.slice(0, 8),
        svgLen: thumbnail.length,
        fileState: readMindMapTraceFileState(fileId),
      });
      debugMindMapThumb(
        "persistNativeMindMapThumbnail | server skipped dirty",
        {
          fileId8: fileId.slice(0, 8),
        },
      );
      return thumbnail;
    }

    traceMindMapOperation("thumbnail.persistNative.serverRequest", {
      fileId8: fileId.slice(0, 8),
      svgLen: thumbnail.length,
      fileStateBeforeServer: readMindMapTraceFileState(fileId),
    });
    const result = await ServerSync.saveThumbnailOnly(fileId, thumbnail, name);
    if (result?.content_sha256) {
      finalizeSavedThumbnail({
        fileId,
        kind: "mindmap",
        name: result.name ?? name ?? "",
        contentSha: result.content_sha256,
        version: result.version ?? null,
        updatedAt: result.updated_at ?? null,
        thumbnail,
      });
    }
    clearThumbnailServerMiss(fileId);
    window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
    window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
    debugMindMapThumb("persistNativeMindMapThumbnail | server ok", {
      fileId8: fileId.slice(0, 8),
      skipped: !!result?.skipped,
      contentSha256: result?.content_sha256?.slice(0, 8) ?? null,
    });
    traceMindMapOperation("thumbnail.persistNative.serverAfter", {
      fileId8: fileId.slice(0, 8),
      svgLen: thumbnail.length,
      skipped: !!result?.skipped,
      serverContentSha256: result?.content_sha256 ?? null,
      fileStateAfterServer: readMindMapTraceFileState(fileId),
    });
    return thumbnail;
  } catch (err) {
    traceMindMapOperation("thumbnail.persistNative.fail", {
      fileId8: fileId.slice(0, 8),
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      fileStateAfterError: readMindMapTraceFileState(fileId),
    });
    debugMindMapThumb("persistNativeMindMapThumbnail | FAILED", {
      fileId8: fileId.slice(0, 8),
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return undefined;
  }
}

/** Native simple-mind-map thumbnail export for list cards and imports. */
export async function generateMindMapThumbnailAndCache(
  fileId: string,
  data: MindMapDocumentData,
): Promise<string | undefined> {
  try {
    const thumbnail = await generateNativeMindMapThumbnailAndCache(
      fileId,
      data,
    );
    debugMindMapThumb("generateMindMapThumbnailAndCache | native", {
      fileId8: fileId.slice(0, 8),
      svgLen: thumbnail?.length ?? 0,
    });
    return thumbnail;
  } catch (err) {
    debugMindMapThumb("generateMindMapThumbnailAndCache | FAILED", {
      fileId8: fileId.slice(0, 8),
      message: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}
