import { buildServerUpdateConfirmCopy } from "../data/editorSyncSurface";

import { requestEditorPlatformConfirm } from "./editorPlatformDialog";

export type LeaveEditorConfirmChoice = "save" | "discard" | "cancel";
export type ServerUpdateConfirmChoice = "keep-local" | "load-remote" | "cancel";

export type LeaveEditorConfirmReason =
  | "unsaved-edits"
  | "local-draft-not-saved";

export async function promptLeaveEditorConfirm(opts: {
  contentLabel: "画布" | "mindmap";
  reason: LeaveEditorConfirmReason;
}): Promise<LeaveEditorConfirmChoice> {
  const message =
    opts.reason === "local-draft-not-saved"
      ? `当前 ${opts.contentLabel} 尚未保存到本地文件夹，是否保存？`
      : `当前 ${opts.contentLabel} 有未保存的修改，是否保存？`;

  const choice = await requestEditorPlatformConfirm({
    title: "主页",
    message,
    primaryLabel: "保存并返回",
    primaryVariant: "primary",
    secondaryLabel: "不保存，放弃修改并返回",
    secondaryVariant: "danger",
    cancelLabel: "取消，继续编辑",
  });

  if (choice === "primary") {
    return "save";
  }
  if (choice === "secondary") {
    return "discard";
  }
  return "cancel";
}

export async function promptServerUpdateConfirm(opts: {
  documentName?: string | null;
  serverVersion?: number | null;
  mode: "remote-update" | "save-conflict";
}): Promise<ServerUpdateConfirmChoice> {
  const copy = buildServerUpdateConfirmCopy(opts);

  const choice = await requestEditorPlatformConfirm({
    title: copy.title,
    message: copy.message,
    primaryLabel: copy.primaryLabel,
    primaryVariant: "primary",
    secondaryLabel: copy.secondaryLabel,
    secondaryVariant: "danger",
    dismissOnOverlay: false,
  });

  if (choice === "primary") {
    return "keep-local";
  }
  if (choice === "secondary") {
    return "load-remote";
  }
  return "cancel";
}
