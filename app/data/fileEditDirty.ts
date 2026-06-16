import { FileSyncState } from "./FileSyncState";

/**
 * 「编辑会话」中与服务器基线比较的浅层 façade：防抖草稿指纹与 baseline 分离在 FileSyncState，
 * UI 在进入「离开决策」前应统一 flush 再判定。
 */
export const FileEditDirty = {
  /** 防抖中的 setDraftHash 立即落盘，再调用 hasUnsavedChanges 才可信。 */
  flushPendingDraftFingerprint(flusher: { flush: () => void }): void {
    flusher.flush();
  },

  /** 先落盘嵌入式资源，再 flush 草稿防抖指纹；之后再读 hasUnsaved / 场景快照。 */
  prepareForDirtyEvaluation(opts: {
    flushEmbeddedLocalFiles: () => void;
    draftFlusher: { flush: () => void };
  }): void {
    opts.flushEmbeddedLocalFiles();
    FileEditDirty.flushPendingDraftFingerprint(opts.draftFlusher);
  },

  /** 是否与上次保存对齐的基线不一致（草稿哈希已更新）。 */
  hasUnsavedChanges(fileId: string): boolean {
    return FileSyncState.hasUnsavedChanges(fileId);
  },
} as const;
