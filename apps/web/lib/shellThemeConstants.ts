/** 首页/外壳主题 localStorage 键，与编辑器内 excalidraw-theme 独立 */
export const SHELL_THEME_STORAGE_KEY = "editorhub-shell-theme";

/** 与 filelistTheme.scss --nb-page-bg 一致，用于首屏与 Electron 窗口底色 */
export const SHELL_PAGE_BG = {
  light: "#f8fcff",
  dark: "#121212",
} as const;

export type ShellTheme = keyof typeof SHELL_PAGE_BG;

export function shellThemePageBackground(theme: ShellTheme): string {
  return SHELL_PAGE_BG[theme];
}

export function readShellThemeFromStorage(): ShellTheme {
  try {
    const raw = localStorage.getItem(SHELL_THEME_STORAGE_KEY);
    return raw === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}
