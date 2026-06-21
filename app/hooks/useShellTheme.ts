import { useCallback, useLayoutEffect, useState } from "react";

/** 首页/外壳主题，与编辑器内 excalidraw-theme 独立存储 */
const SHELL_THEME_STORAGE_KEY = "editorhub-shell-theme";

export type ShellTheme = "light" | "dark";

export function readShellTheme(): ShellTheme {
  try {
    const raw = localStorage.getItem(SHELL_THEME_STORAGE_KEY);
    return raw === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function shellThemeClassName(theme?: ShellTheme): `theme--${ShellTheme}` {
  return `theme--${theme ?? readShellTheme()}`;
}

/** 外壳亮/暗主题（首页、悬浮球、弹窗），与编辑器画布主题独立存储 */
export function useShellTheme() {
  const [shellTheme, setShellTheme] = useState<ShellTheme>(readShellTheme);

  useLayoutEffect(() => {
    try {
      localStorage.setItem(SHELL_THEME_STORAGE_KEY, shellTheme);
    } catch {
      // ignore quota / private mode
    }
  }, [shellTheme]);

  const toggleShellTheme = useCallback(() => {
    setShellTheme((theme) => (theme === "dark" ? "light" : "dark"));
  }, []);

  return { shellTheme, setShellTheme, toggleShellTheme };
}
