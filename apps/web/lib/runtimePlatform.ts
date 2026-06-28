/** Desktop 便携版（Electron）：preload 注入 editorHubDesktop，或 UA 含 EditorHub/ */
export function isDesktopEditorHub(): boolean {
  if (typeof window !== "undefined" && window.editorHubDesktop) {
    return true;
  }
  if (typeof window !== "undefined" && window.location.protocol === "editorhub:") {
    return true;
  }
  if (typeof navigator !== "undefined") {
    return /EditorHub\//i.test(navigator.userAgent);
  }
  return false;
}

/** 桌面版「最近 → 打开 / track by path」：需能解析本地绝对路径。 */
export function canOpenRecentByCatalogPath(): boolean {
  if (isDesktopEditorHub()) {
    return true;
  }
  if (typeof window !== "undefined") {
    const desktop = window.editorHubDesktop;
    if (
      typeof desktop?.getPathForFile === "function" ||
      typeof desktop?.invokeApi === "function"
    ) {
      return true;
    }
  }
  return false;
}
