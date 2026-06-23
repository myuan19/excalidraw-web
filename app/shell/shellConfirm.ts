import { requestEditorPlatformConfirm } from "./editorPlatformDialog";

export type DestructiveConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  dismissOnOverlay?: boolean;
};

/** Promise 式危险操作确认，走平台级 ShellConfirmHost + AppConfirmDialog。 */
export async function requestDestructiveConfirm(
  options: DestructiveConfirmOptions,
): Promise<boolean> {
  try {
    const action = await requestEditorPlatformConfirm({
      title: options.title,
      message: options.message,
      primaryLabel: options.confirmLabel ?? "确定",
      primaryVariant: "danger",
      cancelLabel: options.cancelLabel ?? "取消",
      dismissOnOverlay: options.dismissOnOverlay,
    });
    return action === "primary";
  } catch {
    return false;
  }
}
