import type { ActiveEditorSaveSource } from "./activeEditorSaveBridge";
import { isLocalDraftFileId } from "./localDraftFileId";
import { LocalDraftSessions } from "./localDraftSessions";

/** Non-empty folder id locks the save dialog to that folder. */
export function resolveLocalDraftPresetFolderId(
  folderId: string | null | undefined,
): string | undefined {
  if (typeof folderId === "string" && folderId.length > 0) {
    return folderId;
  }
  return undefined;
}

export function localDraftNeedsSaveFolderPicker(
  folderId: string | null | undefined,
): boolean {
  return resolveLocalDraftPresetFolderId(folderId) === undefined;
}

export function getLocalDraftPresetFolderIdForFile(
  fileId: string | null,
  fileFolderId?: string | null,
): string | undefined {
  if (fileFolderId !== undefined) {
    return resolveLocalDraftPresetFolderId(fileFolderId);
  }
  if (!fileId || !isLocalDraftFileId(fileId)) {
    return undefined;
  }
  const meta = LocalDraftSessions.get(fileId);
  if (!meta) {
    return undefined;
  }
  return resolveLocalDraftPresetFolderId(meta.folder_id);
}

/** 「最近」草稿或未绑定目录的草稿：桌面版走系统保存对话框。 */
export function shouldUseNativeSaveDialogForDraft(
  fileId: string | null,
): boolean {
  if (!fileId || !isLocalDraftFileId(fileId)) {
    return false;
  }
  const meta = LocalDraftSessions.get(fileId);
  if (meta?.save_target === "native") {
    return true;
  }
  if (meta?.save_target === "catalog") {
    return false;
  }
  return localDraftNeedsSaveFolderPicker(meta?.folder_id);
}

/** Without a mapped folder, manual/exit save opens the folder picker. */
export function shouldSkipLocalDraftFormalSave(
  source: ActiveEditorSaveSource,
  folderId: string | null | undefined,
): boolean {
  if (!localDraftNeedsSaveFolderPicker(folderId)) {
    return false;
  }
  return source !== "manual" && source !== "exit";
}
