import { isDesktopEditorHub } from "../lib/runtimePlatform";

/**
 * Copy policy for sync conflict dialogs (Desktop disk vs Web server).
 * UI shells call `buildServerUpdateConfirmCopy`; do not branch on `isDesktopEditorHub` elsewhere.
 */
export type EditorSyncSurface = "remote-server" | "local-folder";

export type ServerUpdateConfirmMode = "remote-update" | "save-conflict";

export function getEditorSyncSurface(): EditorSyncSurface {
  return isDesktopEditorHub() ? "local-folder" : "remote-server";
}

export function buildServerUpdateConfirmCopy(opts: {
  documentName?: string | null;
  serverVersion?: number | null;
  mode: ServerUpdateConfirmMode;
  surface?: EditorSyncSurface;
}): {
  title: string;
  message: string;
  primaryLabel: string;
  secondaryLabel: string;
} {
  const surface = opts.surface ?? getEditorSyncSurface();
  if (surface === "local-folder") {
    const subject = opts.documentName?.trim()
      ? `「${opts.documentName.trim()}」`
      : "当前文档";
    if (opts.mode === "save-conflict") {
      return {
        title: "磁盘文件已更改",
        message: `${subject}的磁盘文件已被更改。当前页面有未保存修改。\n\n继续覆盖将用当前修改写回磁盘。\n载入磁盘文件将放弃当前未保存修改。`,
        primaryLabel: "继续覆盖",
        secondaryLabel: "载入磁盘文件",
      };
    }
    return {
      title: "磁盘文件已更改",
      message: `${subject}的磁盘文件已被更改。当前页面有未保存修改。\n\n继续编辑将保留当前页面内容。\n载入磁盘文件将放弃当前未保存修改。`,
      primaryLabel: "继续编辑",
      secondaryLabel: "载入磁盘文件",
    };
  }

  const subject = opts.documentName?.trim()
    ? `「${opts.documentName.trim()}」`
    : "当前文档";
  const version =
    typeof opts.serverVersion === "number"
      ? `（v${opts.serverVersion}）`
      : "";
  const keepLocalEffect =
    opts.mode === "save-conflict"
      ? "保留当前修改将覆盖服务器的新版本。"
      : "保留当前修改将继续留在当前页面。";

  return {
    title: "检测到服务器有更新",
    message: `${subject}在服务器上已有新版本${version}。当前页面有未保存修改。\n\n${keepLocalEffect}\n载入服务器版本将放弃当前未保存修改。`,
    primaryLabel: "保留当前修改",
    secondaryLabel: "载入服务器版本",
  };
}
