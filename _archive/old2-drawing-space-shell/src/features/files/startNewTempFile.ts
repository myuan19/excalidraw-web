import { openTempDocumentFile } from "@/features/tempFiles/openTempDocumentFile";
import { createTempFile } from "@/features/tempFiles/createTempFile";
import { detachActiveTempEditor, getActiveTempFile } from "@/features/tempFiles/discardTempSession";
import { showEditorView } from "@/features/navigation/showEditorView";
import { editorDebugLog } from "@/features/logging/editorDebugLog";
import { useAppStore } from "@/stores/appStore";
import { useEditorStore } from "@/stores/editorStore";

export async function createAndOpenTempFile(kind: string) {
  editorDebugLog("startNewTempFile.createAndOpen", { kind });
  const store = useEditorStore.getState();
  if (store.activeEditor) {
    store.flushPendingDraft();
    store.closeEditor();
  }

  const file = await createTempFile(kind);
  await openTempDocumentFile(file);
  editorDebugLog("startNewTempFile.createAndOpen.done", {
    kind,
    fileId: file.id,
  });
}

/** 点击新建：无进行中临时文件则直接创建，否则弹出「继续编辑 / 丢弃并新建」 */
export function requestNewTempFile(kind: string) {
  editorDebugLog("startNewTempFile.request", { kind, hasActiveTemp: !!getActiveTempFile() });
  if (!getActiveTempFile()) {
    showEditorView();
    void createAndOpenTempFile(kind);
    return;
  }
  useAppStore.getState().openTempSessionDialog(kind);
}

export function continueEditingTempSession() {
  showEditorView();
  useAppStore.getState().closeTempSessionDialog();
}

export function discardTempAndShowPicker() {
  detachActiveTempEditor();
  useAppStore.getState().closeTempSessionDialog();
  showEditorView();
}

export async function discardTempAndCreateNew(kind: string) {
  detachActiveTempEditor();
  useAppStore.getState().closeTempSessionDialog();
  await createAndOpenTempFile(kind);
}

/** 文件管理「新建」：无类型时进入编辑器选择页 */
export function requestNewFromFiles() {
  if (getActiveTempFile()) {
    useAppStore.getState().openTempSessionDialog(null);
    return;
  }
  const store = useEditorStore.getState();
  if (store.activeEditor) {
    store.flushPendingDraft();
    store.closeEditor();
  }
  showEditorView();
}
