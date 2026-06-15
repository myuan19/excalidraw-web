import { FileSyncState } from "./FileSyncState";

/**
 * 「编辑会话」中与服务器基线比较的浅层 façade：防抖草稿指纹与 baseline 分离在 FileSyncState，
 * UI 在进入「离开决策」前应统一 flush 再判定。
 */
export const VISIBILITY_BACKGROUND_SAVE_DELAY_MS = 400;

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

  /**
   * 标签页切入后台并经延迟后触发：嵌入式 + 草稿指纹 flush →（可选）上传。
   * 对齐「主页前先 flush」的语义，避免防抖未落地时误判无改动。
   */
  runVisibilityHiddenSavePipeline(opts: {
    flushEmbeddedLocalFiles: () => void;
    draftFlusher: { flush: () => void };
    fileId: string | null;
    uploadInFlight: boolean;
    onShouldUpload: () => void;
  }): void {
    FileEditDirty.prepareForDirtyEvaluation({
      flushEmbeddedLocalFiles: opts.flushEmbeddedLocalFiles,
      draftFlusher: opts.draftFlusher,
    });
    const fid = opts.fileId;
    if (!fid || opts.uploadInFlight) {
      return;
    }
    if (!FileEditDirty.hasUnsavedChanges(fid)) {
      return;
    }
    opts.onShouldUpload();
  },
} as const;
