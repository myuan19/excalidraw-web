import {
  defaultLang,
  languages,
  type Language,
} from "@excalidraw/excalidraw/i18n";

export const APP_LANG_OVERRIDE_KEY = "editorhub-lang-override";
/** Select value: clear manual override and follow OS / browser locale. */
export const FOLLOW_SYSTEM_LANG = "__system__";

export function readSystemLanguageCandidates(): string[] {
  if (typeof navigator === "undefined") {
    return [];
  }
  const candidates: string[] = [];
  if (Array.isArray(navigator.languages)) {
    candidates.push(...navigator.languages.map((lang) => String(lang)));
  }
  if (navigator.language) {
    candidates.push(navigator.language);
  }
  return [...new Set(candidates.map((lang) => lang.trim()).filter(Boolean))];
}

export function readLanguageOverride(): string | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  try {
    const stored = localStorage.getItem(APP_LANG_OVERRIDE_KEY);
    if (!stored) {
      return null;
    }
    return languages.some((lang) => lang.code === stored) ? stored : null;
  } catch {
    return null;
  }
}

export function writeLanguageOverride(code: string | null): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    if (code) {
      localStorage.setItem(APP_LANG_OVERRIDE_KEY, code);
    } else {
      localStorage.removeItem(APP_LANG_OVERRIDE_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function resolveExcalidrawLangCode(
  candidates: string[],
  supported: readonly Language[] = languages,
): string {
  for (const raw of candidates) {
    const matched = matchLocaleToExcalidrawLang(raw, supported);
    if (matched) {
      return matched;
    }
  }
  return defaultLang.code;
}

export function matchLocaleToExcalidrawLang(
  raw: string,
  supported: readonly Language[] = languages,
): string | null {
  const normalized = raw.trim().replace(/_/g, "-");
  if (!normalized) {
    return null;
  }
  const lower = normalized.toLowerCase();

  const exact = supported.find((lang) => lang.code.toLowerCase() === lower);
  if (exact) {
    return exact.code;
  }

  const [language, region] = lower.split("-");

  if (language === "zh") {
    if (
      region === "tw" ||
      region === "hk" ||
      region === "mo" ||
      region === "hant"
    ) {
      return (
        supported.find((lang) => lang.code === "zh-TW")?.code ??
        supported.find((lang) => lang.code === "zh-CN")?.code ??
        null
      );
    }
    return supported.find((lang) => lang.code === "zh-CN")?.code ?? null;
  }

  if (language === "en") {
    return defaultLang.code;
  }

  const regional = supported.find((lang) => {
    const code = lang.code.toLowerCase();
    return code.startsWith(`${language}-`);
  });
  if (regional) {
    return regional.code;
  }

  return null;
}

/** Manual override if set; otherwise OS / browser locale mapped to Excalidraw. */
export function getPreferredLanguage(): string {
  const override = readLanguageOverride();
  if (override) {
    return override;
  }
  return resolveExcalidrawLangCode(readSystemLanguageCandidates());
}

export function isFollowingSystemLanguage(): boolean {
  return readLanguageOverride() == null;
}
