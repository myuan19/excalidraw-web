import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settingsStore";

export function useApplyAppearance() {
  const theme = useSettingsStore((state) => state.theme);
  const language = useSettingsStore((state) => state.language);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const effectiveTheme = theme === "system" ? (media.matches ? "dark" : "light") : theme;
      root.dataset.theme = effectiveTheme;
      root.classList.toggle("dark", effectiveTheme === "dark");
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
}
