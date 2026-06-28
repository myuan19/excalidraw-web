import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
  useEffect,
  type ReactNode,
} from "react";

/** 首页/外壳主题，与编辑器内 excalidraw-theme 独立存储 */
const SHELL_THEME_STORAGE_KEY = "editorhub-shell-theme";

export const SHELL_THEME_CHANGE_EVENT = "editorhub-shell-theme-change";

export type ShellTheme = "light" | "dark";

export type ShellThemeContextValue = {
  shellTheme: ShellTheme;
  setShellTheme: (value: ShellTheme | ((theme: ShellTheme) => ShellTheme)) => void;
  toggleShellTheme: () => void;
};

const ShellThemeContext = createContext<ShellThemeContextValue | null>(null);

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

function publishShellTheme(theme: ShellTheme) {
  try {
    localStorage.setItem(SHELL_THEME_STORAGE_KEY, theme);
  } catch {
    // ignore quota / private mode
  }
  window.dispatchEvent(
    new CustomEvent<ShellTheme>(SHELL_THEME_CHANGE_EVENT, {
      detail: theme,
    }),
  );
}

export function subscribeShellThemeChange(
  handler: (theme: ShellTheme) => void,
): () => void {
  const onCustom = (event: Event) => {
    const detail = (event as CustomEvent<ShellTheme>).detail;
    if (detail === "light" || detail === "dark") {
      handler(detail);
    }
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === SHELL_THEME_STORAGE_KEY) {
      handler(readShellTheme());
    }
  };
  window.addEventListener(SHELL_THEME_CHANGE_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(SHELL_THEME_CHANGE_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

function useShellThemeState(): ShellThemeContextValue {
  const [shellTheme, setShellTheme] = useState<ShellTheme>(readShellTheme);

  useLayoutEffect(() => {
    publishShellTheme(shellTheme);
  }, [shellTheme]);

  const toggleShellTheme = useCallback(() => {
    setShellTheme((theme) => (theme === "dark" ? "light" : "dark"));
  }, []);

  return { shellTheme, setShellTheme, toggleShellTheme };
}

/** 应用根包裹，使标题栏与首页等同帧切换主题 */
export function ShellThemeProvider({ children }: { children: ReactNode }) {
  const value = useShellThemeState();
  return createElement(ShellThemeContext.Provider, { value }, children);
}

/** 订阅外壳主题变化（弹窗/portal 与 filelist 状态同步）。 */
export function useLiveShellTheme(): ShellTheme {
  const ctx = useContext(ShellThemeContext);
  if (ctx) {
    return ctx.shellTheme;
  }
  const [theme, setTheme] = useState<ShellTheme>(readShellTheme);
  useEffect(() => subscribeShellThemeChange(setTheme), []);
  return theme;
}

/** 外壳亮/暗主题（首页、标题栏、弹窗），与编辑器画布主题独立存储 */
export function useShellTheme(): ShellThemeContextValue {
  const ctx = useContext(ShellThemeContext);
  if (!ctx) {
    throw new Error("useShellTheme must be used within ShellThemeProvider");
  }
  return ctx;
}
