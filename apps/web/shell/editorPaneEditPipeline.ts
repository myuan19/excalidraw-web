export const EDITOR_FILE_SYNC_STATE_EVENT = "excalidraw-file-sync-state";

const activeReasons = new Map<string, Set<string>>();

export type EditorPaneEditPipelineHoldRef = {
  current: (() => void) | null;
};

function emitSyncState(): void {
  window.dispatchEvent(new CustomEvent(EDITOR_FILE_SYNC_STATE_EVENT));
}

/** 编辑管线阶段（检测变化 / 黄点 / 等待保存 / 保存中）——后台 pane 保持 keep-running。 */
export function markEditorPaneEditPipeline(
  fileId: string,
  reason: string,
): () => void {
  let reasons = activeReasons.get(fileId);
  if (!reasons) {
    reasons = new Set();
    activeReasons.set(fileId, reasons);
  }
  const wasActive = reasons.size > 0;
  reasons.add(reason);
  if (!wasActive) {
    emitSyncState();
  }
  return () => {
    const set = activeReasons.get(fileId);
    if (!set) {
      return;
    }
    set.delete(reason);
    if (set.size === 0) {
      activeReasons.delete(fileId);
      emitSyncState();
    }
  };
}

export function releaseEditorPaneEditPipelineHold(
  holdRef: EditorPaneEditPipelineHoldRef,
): void {
  holdRef.current?.();
  holdRef.current = null;
}

export function retainEditorPaneEditPipelineHold(
  holdRef: EditorPaneEditPipelineHoldRef,
  fileId: string | null | undefined,
  reason: string,
): void {
  releaseEditorPaneEditPipelineHold(holdRef);
  if (!fileId) {
    return;
  }
  holdRef.current = markEditorPaneEditPipeline(fileId, reason);
}

/** 将 idle 阶段保活令牌交接给下一阶段（如 save-in-flight），避免释放后再 acquire 的空档。 */
export function transferEditorPaneEditPipelineHold(
  fromRef: EditorPaneEditPipelineHoldRef,
  toRef: EditorPaneEditPipelineHoldRef,
  fileId: string | null | undefined,
  reason: string,
): void {
  releaseEditorPaneEditPipelineHold(fromRef);
  retainEditorPaneEditPipelineHold(toRef, fileId, reason);
}

export function isEditorPaneEditPipelineActive(fileId: string): boolean {
  return (activeReasons.get(fileId)?.size ?? 0) > 0;
}

export function listEditorPaneEditPipelineReasons(fileId: string): string[] {
  return [...(activeReasons.get(fileId) ?? [])];
}
