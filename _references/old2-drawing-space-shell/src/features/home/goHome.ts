import { LocalThumbnailCache } from "@/features/thumbnail";
import { FileSyncState, LocalDraftStorage } from "@/features/sync";
import { isLocalTempFileId } from "@/features/tempFiles/tempFileId";
import { type AppView, useAppStore } from "@/stores/appStore";
import { useEditorStore } from "@/stores/editorStore";

export const APP_GO_HOME_EVENT = "app-go-home";
export const APP_LEAVE_EDITOR_EVENT = "app-leave-editor";

export function requestGoHome() {
  window.dispatchEvent(new Event(APP_GO_HOME_EVENT));
}

export function requestLeaveEditor() {
  window.dispatchEvent(new Event(APP_LEAVE_EDITOR_EVENT));
}

export function navigateToView(view: AppView) {
  useAppStore.getState().setPendingNavigateView(null);
  useAppStore.getState().setActiveView(view);
}

export async function finishLeaveAfterSave(nextView: AppView) {
  await useEditorStore.getState().saveActiveFile();
  navigateToView(nextView);
}

export function finishLeaveDiscard(nextView: AppView) {
  const fileId = useEditorStore.getState().activeFile?.id;
  if (fileId && !isLocalTempFileId(fileId)) {
    LocalDraftStorage.remove(fileId);
    LocalThumbnailCache.clear(fileId);
    FileSyncState.clearDraft(fileId);
  }
  navigateToView(nextView);
}

/**
 * 评估离开编辑器：临时文件直通；已落库草稿需弹窗。
 */
export function evaluateEditorLeave(nextView: AppView): "noop" | "direct" | "prompt" {
  const { activeView } = useAppStore.getState();
  const activeFile = useEditorStore.getState().activeFile;

  if (activeView !== "editor" || !activeFile) {
    navigateToView(nextView);
    return "noop";
  }

  if (isLocalTempFileId(activeFile.id)) {
    navigateToView(nextView);
    return "direct";
  }

  useEditorStore.getState().flushPendingDraft();
  useEditorStore.getState().settleDraftState(activeFile.id);
  if (!FileSyncState.hasUnsavedChanges(activeFile.id)) {
    navigateToView(nextView);
    return "direct";
  }

  useAppStore.getState().setPendingNavigateView(nextView);
  return "prompt";
}

/** @deprecated 使用 evaluateEditorLeave("home") */
export function evaluateGoHome(): "noop" | "direct" | "prompt" {
  return evaluateEditorLeave("home");
}

export async function finishGoHomeAfterSave() {
  await finishLeaveAfterSave("home");
}

export function finishGoHomeDiscard() {
  finishLeaveDiscard("home");
}

export function finishGoHomeDirect() {
  navigateToView("home");
}
