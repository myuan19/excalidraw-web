import {
  requestEditorTabDiscard,
  requestEditorTabSave,
} from "../data/activeEditorSaveBridge";
import { discardLocalDraftSession } from "../data/discardLocalDraftSession";
import {
  resolveEditorHomeNavPlan,
  shouldNavigateAfterExitSave,
} from "../data/editorLeaveHome";
import { isAutoSaveOnExitActive } from "../data/appSettings";
import { isLocalDraftFileId } from "../data/localDraftFileId";
import { editorRegistry } from "../editors/registry";

import { promptLeaveEditorConfirm } from "./editorLeaveConfirm";

export function resolveEditorLeaveContentLabel(
  kind: string | null | undefined,
): "画布" | "mindmap" {
  return editorRegistry.resolveKind(kind) === "mindmap" ? "mindmap" : "画布";
}

/**
 * 离开编辑器前的统一确认（顶部 ×、侧栏关闭、文件/最近导航共用）。
 * 返回 true 表示可继续关闭/导航；false 表示用户取消或保存未完成。
 */
export async function confirmEditorLeaveForFile(
  fileId: string,
  opts: { kind?: string | null } = {},
): Promise<boolean> {
  const kind = opts.kind ?? null;
  const plan = resolveEditorHomeNavPlan(fileId, { kind });
  if (plan.action !== "prompt-leave") {
    return true;
  }

  if (isAutoSaveOnExitActive() && !isLocalDraftFileId(fileId)) {
    const saved = await requestEditorTabSave(fileId, "exit");
    return shouldNavigateAfterExitSave(saved, fileId, kind);
  }

  const choice = await promptLeaveEditorConfirm({
    contentLabel: resolveEditorLeaveContentLabel(kind),
    reason: isLocalDraftFileId(fileId)
      ? "local-draft-not-saved"
      : "unsaved-edits",
  });
  if (choice === "cancel") {
    return false;
  }
  if (choice === "discard") {
    if (isLocalDraftFileId(fileId)) {
      await discardLocalDraftSession(fileId);
      return true;
    }
    await requestEditorTabDiscard(fileId);
    return true;
  }

  const saved = await requestEditorTabSave(fileId, "exit");
  return shouldNavigateAfterExitSave(saved, fileId, kind);
}
