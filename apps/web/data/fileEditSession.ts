/**
 * 画布「编辑会话」中与离开/放弃相关的编排（与 {@link FileEditDirty} 的 dirty 判定配合使用）。
 */
import { DeltaStorage } from "./DeltaStorage";
import { discardLocalDraftSession } from "./discardLocalDraftSession";
import { FileSyncState } from "./FileSyncState";
import { isLocalDraftFileId } from "./localDraftFileId";

export type DiscardLocalEditsDeps = {
  getFileId: () => string | null;
  /** 与 FileEditDirty.flushPendingDraftFingerprint 同源：立即落盘防抖中的 draft 指纹。 */
  flushDraftDebounce: () => void;
  /** 与 EditorShell 中 localPersistGenRef 对齐，废止进行中的异步本地持久化代数。 */
  bumpPersistGeneration: () => void;
  navigateToFileListHome: () => void;
};

/**
 * 放弃当前文件的本地编辑（清 local cache、快照 delta、draft 对齐 baseline），事件通知后回到文件列表。
 * 不包含画布 UI 回滚；调用方已通过 hash 离开编辑器。
 */
export async function discardLocalEditsNavigateHome(
  deps: DiscardLocalEditsDeps,
): Promise<void> {
  const fid = deps.getFileId();
  if (!fid) {
    deps.navigateToFileListHome();
    return;
  }
  deps.flushDraftDebounce();
  deps.bumpPersistGeneration();

  if (isLocalDraftFileId(fid)) {
    await discardLocalDraftSession(fid);
    deps.navigateToFileListHome();
    return;
  }

  await DeltaStorage.restoreSnapshot([]);
  FileSyncState.clearLocalCache(fid);
  const bh = FileSyncState.getBaselineHash(fid);
  if (bh) {
    FileSyncState.setDraftHash(fid, bh);
  } else {
    FileSyncState.clearDraftHash(fid);
    FileSyncState.clearBaselineHash(fid);
  }
  FileSyncState.clearLocalEditTime(fid);
  window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
  window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
  deps.navigateToFileListHome();
}
