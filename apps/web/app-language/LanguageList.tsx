import { useI18n, languages } from "@excalidraw/excalidraw/i18n";
import React, { useMemo } from "react";

import { useSetAtom } from "../app-jotai";

import {
  FOLLOW_SYSTEM_LANG,
  getPreferredLanguage,
  isFollowingSystemLanguage,
  readLanguageOverride,
  writeLanguageOverride,
} from "./language-detector";
import { appLangCodeAtom } from "./language-state";

export const LanguageList = ({ style }: { style?: React.CSSProperties }) => {
  const { t, langCode } = useI18n();
  const setLangCode = useSetAtom(appLangCodeAtom);
  const selectValue = useMemo(
    () => (isFollowingSystemLanguage() ? FOLLOW_SYSTEM_LANG : readLanguageOverride() ?? langCode),
    [langCode],
  );

  return (
    <select
      className="dropdown-select dropdown-select__language"
      onChange={({ target }) => {
        const next = target.value;
        if (next === FOLLOW_SYSTEM_LANG) {
          writeLanguageOverride(null);
          setLangCode(getPreferredLanguage());
          return;
        }
        writeLanguageOverride(next);
        setLangCode(next);
      }}
      value={selectValue}
      aria-label={t("buttons.selectLanguage")}
      style={style}
    >
      <option value={FOLLOW_SYSTEM_LANG}>
        {langCode === "zh-CN" || langCode === "zh-TW"
          ? "跟随系统"
          : "Follow system"}
      </option>
      {languages.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.label}
        </option>
      ))}
    </select>
  );
};
