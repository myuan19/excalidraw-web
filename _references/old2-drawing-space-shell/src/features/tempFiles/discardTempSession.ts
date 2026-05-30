import { LocalThumbnailCache } from "@/features/thumbnail";
import { FileSyncState, LocalDraftStorage } from "@/features/sync";
import { useEditorStore } from "@/stores/editorStore";
import { isLocalTempFileId } from "./tempFileId";

/** 结束当前临时编辑会话，但保留 TempFileStorage 条目供「最近打开」再次进入 */
export function detachActiveTempEditor() {
  const { activeFile, flushPendingDraft, closeEditor } = useEditorStore.getState();
  if (!activeFile || !isLocalTempFileId(activeFile.id)) return;

  flushPendingDraft();
  closeEditor();
}

export function getActiveTempFile() {
  const { activeFile } = useEditorStore.getState();
  if (!activeFile || !isLocalTempFileId(activeFile.id)) return null;
  return activeFile;
}

/** 彻底删除临时文件（可选，当前「丢弃并新建」仅 detach，不删索引） */
export function purgeTempFile(fileId: string) {
  if (!isLocalTempFileId(fileId)) return;
  LocalDraftStorage.remove(fileId);
  LocalThumbnailCache.clear(fileId);
  FileSyncState.remove(fileId);
}
