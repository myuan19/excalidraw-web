import { FileSyncState } from "./FileSyncState";
import { generateExcalidrawThumbnailAndCache } from "./excalidrawThumbnail";
import { isLocalDraftFileId } from "./localDraftFileId";
import { LocalThumbnailCache } from "./localThumbnailCache";
import { generateMindMapThumbnailAndCache } from "./mindMapThumbnail";

import type { MindMapDocumentData } from "./formats/MindMapAdapter";
import type { ForkSceneSnapshot } from "./forkFileTypes";

function getCachedDocumentKind(cache: { document?: unknown } | null): string | null {
  const kind = (cache?.document as { kind?: unknown } | undefined)?.kind;
  return typeof kind === "string" ? kind : null;
}

/**
 * LocalThumbnailCache 是会话缓存；服务重启/刷新后，local-draft 的文档仍在
 * FileSyncState(localStorage)，缩略图可由本地文档缓存重新生成。
 */
export async function ensureLocalDraftThumbnailFromCache(
  fileId: string,
  kind?: string | null,
): Promise<string | null> {
  if (!isLocalDraftFileId(fileId)) {
    return null;
  }
  const existing = LocalThumbnailCache.getForDraft(
    fileId,
    FileSyncState.getDraftHash(fileId),
  );
  if (existing) {
    return existing;
  }
  const cache = FileSyncState.getLocalCache(fileId);
  if (!cache) {
    return null;
  }
  const resolvedKind = kind ?? getCachedDocumentKind(cache);
  if (resolvedKind === "mindmap") {
    const document = cache.document as { data?: MindMapDocumentData } | undefined;
    if (!document?.data) {
      return null;
    }
    return (await generateMindMapThumbnailAndCache(fileId, document.data)) ?? null;
  }
  if (resolvedKind === "excalidraw") {
    return (
      (await generateExcalidrawThumbnailAndCache(
        fileId,
        {
          elements: (cache as ForkSceneSnapshot).elements ?? [],
          appState: (cache as ForkSceneSnapshot).appState ?? {},
          files: (cache as ForkSceneSnapshot).files ?? {},
        },
      )) ?? null
    );
  }
  return null;
}
