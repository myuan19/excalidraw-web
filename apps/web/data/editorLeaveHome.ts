import { readStoredFileModificationState } from "./fileModificationState";
import { isNewDocumentHash } from "./documentHash";
import { isLocalDraftFileId } from "./localDraftFileId";

export type EditorHomeNavPlan =
  | { action: "navigate" }
  | { action: "prompt-leave" };

/**
 * 离开编辑器返回主页的唯一决策入口。
 * 读取 {@link readStoredFileModificationState}，不在 UI 层做二次推断。
 */
export function resolveEditorHomeNavPlan(
  fileId: string,
  opts?: { kind?: string | null },
): EditorHomeNavPlan {
  if (isLocalDraftFileId(fileId)) {
    return { action: "prompt-leave" };
  }
  if (readStoredFileModificationState(fileId, opts?.kind).shouldPromptOnLeave) {
    return { action: "prompt-leave" };
  }
  return { action: "navigate" };
}

/** 离开编辑器返回主页时，是否应先弹出「保存 / 不保存」对话框。 */
export function shouldPromptEditorHomeNavDialog(
  fileId: string,
  kind?: string | null,
): boolean {
  return resolveEditorHomeNavPlan(fileId, { kind }).action === "prompt-leave";
}

/** exit 保存后是否可继续离开（并行保存已清 dirty 时仍放行）。 */
export function shouldNavigateAfterExitSave(
  saved: boolean,
  fileId: string | null,
  kind?: string | null,
): boolean {
  return saved || (!!fileId && !shouldPromptEditorHomeNavDialog(fileId, kind));
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
