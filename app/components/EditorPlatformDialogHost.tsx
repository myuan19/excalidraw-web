import {
  EDITOR_PLATFORM_CONFIRM_ROOT_ID,
  ShellConfirmHost,
} from "./ShellConfirmHost";

/** 编辑器平台确认弹窗宿主（挂载于 EditorPlatformSidebar）。 */
export function EditorPlatformDialogHost() {
  return <ShellConfirmHost rootId={EDITOR_PLATFORM_CONFIRM_ROOT_ID} />;
}
