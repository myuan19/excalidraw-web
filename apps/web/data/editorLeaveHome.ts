import { FileSyncState } from "./FileSyncState";
import { isNewDocumentHash } from "./documentHash";
import { isLocalDraftFileId } from "./localDraftFileId";
import { hasRecoverableLocalDraft } from "./localDraftSessions";

/** 离开编辑器返回主页时，是否应先弹出「保存 / 不保存」对话框。 */
export function shouldPromptEditorHomeNavDialog(fileId: string): boolean {
  if (isLocalDraftFileId(fileId)) {
    return hasRecoverableLocalDraft(fileId);
  }
  return FileSyncState.hasUnsavedChanges(fileId);
}

/**
 * hash 仍为 #new=1 且尚未分配 local-draft id 时，不要直接导航离开
 *（否则会跳过离开确认并打断 bootstrap）。
 */
export function shouldDeferLeaveWhileNewDocumentHash(
  fileId: string | null,
  hash?: string,
): boolean {
  return !fileId && isNewDocumentHash(hash);
}
