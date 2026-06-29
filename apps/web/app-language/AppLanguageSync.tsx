import { useEffect } from "react";

import { languages } from "@excalidraw/excalidraw/i18n";

import { useAppLangCode } from "./language-state";

/** Keep `<html lang>` / text direction aligned with the active Excalidraw locale. */
export function AppLanguageSync() {
  const [langCode] = useAppLangCode();

  useEffect(() => {
    const lang = languages.find((entry) => entry.code === langCode);
    document.documentElement.lang = langCode;
    document.documentElement.dir = lang?.rtl ? "rtl" : "ltr";
  }, [langCode]);

  return null;
}
