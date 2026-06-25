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
  const subject = opts.documentName?.trim()
    ? `「${opts.documentName.trim()}」`
    : "当前文档";
  const version =
    typeof opts.serverVersion === "number" ? `（v${opts.serverVersion}）` : "";
  const keepLocalEffect =
    opts.mode === "save-conflict"
      ? "保留当前修改将覆盖服务器的新版本。"
      : "保留当前修改将继续留在当前页面。";

  const choice = await requestEditorPlatformConfirm({
    title: "检测到服务器有更新",
    message: `${subject}在服务器上已有新版本${version}。当前页面有未保存修改。\n\n${keepLocalEffect}\n载入服务器版本将放弃当前未保存修改。`,
    primaryLabel: "保留当前修改",
    primaryVariant: "primary",
    secondaryLabel: "载入服务器版本",
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
