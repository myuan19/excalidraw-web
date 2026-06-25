import { DeltaStorage } from "./DeltaStorage";
import { FileSyncState } from "./FileSyncState";
import { LocalThumbnailCache } from "./localThumbnailCache";
import { isLocalDraftFileId } from "./localDraftFileId";
import { clearMindMapBrowserView } from "./mindMapBrowserViewStorage";
import { traceUserAction } from "../lib/userTrace";
import {
  LocalDraftSessions,
  removeLocalDraftFromRecent,
} from "./localDraftSessions";

const FORK_BROWSER_SCENE_PREFIX = "fork-browser-scene-v1-";

function legacyMindMapCacheKey(fileId: string): string {
  return `mindmap-local-cache-${fileId}`;
}

/**
 * 放弃未保存的 local-draft 会话：清除与正式文件相同的浏览器键，不触及服务器。
 */
export async function discardLocalDraftSession(draftId: string): Promise<void> {
  if (!isLocalDraftFileId(draftId)) {
    traceUserAction("file-list", "discardLocalDraftSession", {
      draftId8: draftId.slice(0, 12),
      reason: "not-local-draft",
    }, "skip");
    return;
  }

  traceUserAction("file-list", "discardLocalDraftSession", {
    draftId8: draftId.slice(0, 12),
  }, "start");

  LocalDraftSessions.remove(draftId);
  removeLocalDraftFromRecent(draftId);
  FileSyncState.clearLocalCache(draftId);
  FileSyncState.clearHashStateForFile(draftId);
  FileSyncState.clearLocalEditTime(draftId);
  LocalThumbnailCache.clear(draftId);

  try {
    localStorage.removeItem(legacyMindMapCacheKey(draftId));
    localStorage.removeItem(`${FORK_BROWSER_SCENE_PREFIX}${draftId}`);
    clearMindMapBrowserView(draftId);
  } catch {
    /* ignore */
  }

  await DeltaStorage.setFileId(draftId);
  await DeltaStorage.restoreSnapshot([]);

  window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
  window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
  traceUserAction("file-list", "discardLocalDraftSession", {
    draftId8: draftId.slice(0, 12),
  }, "ok");
}
