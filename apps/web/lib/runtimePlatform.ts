/** Desktop 便携版（Electron）：preload 注入 editorHubDesktop，或 UA 含 EditorHub/ */
export function isDesktopEditorHub(): boolean {
  if (typeof window !== "undefined" && window.editorHubDesktop) {
    return true;
  }
  if (typeof navigator !== "undefined") {
    return /EditorHub\//i.test(navigator.userAgent);
  }
  return false;
}
