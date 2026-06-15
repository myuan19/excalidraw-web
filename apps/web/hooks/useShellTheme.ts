import { useCallback, useLayoutEffect, useState } from "react";

/** 首页/外壳主题，与编辑器内 excalidraw-theme 独立存储 */
const SHELL_THEME_STORAGE_KEY = "editorhub-shell-theme";

export type ShellTheme = "light" | "dark";

function readShellTheme(): ShellTheme {
  try {
    const raw = localStorage.getItem(SHELL_THEME_STORAGE_KEY);
    return raw === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** 仅作用于文件列表首页与相关弹窗，不影响编辑器画布主题 */
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
