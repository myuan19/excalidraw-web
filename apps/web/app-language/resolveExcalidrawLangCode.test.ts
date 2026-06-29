import { describe, expect, it } from "vitest";

import { defaultLang, languages } from "@excalidraw/excalidraw/i18n";

import {
  matchLocaleToExcalidrawLang,
  resolveExcalidrawLangCode,
} from "./resolveExcalidrawLangCode";

describe("resolveExcalidrawLangCode", () => {
  it("maps Chinese system locales to zh-CN or zh-TW", () => {
    expect(matchLocaleToExcalidrawLang("zh-CN")).toBe("zh-CN");
    expect(matchLocaleToExcalidrawLang("zh")).toBe("zh-CN");
    expect(matchLocaleToExcalidrawLang("zh-TW")).toBe("zh-CN");
    expect(matchLocaleToExcalidrawLang("zh-HK")).toBe("zh-CN");
  });

  it("maps English variants to default English", () => {
    expect(matchLocaleToExcalidrawLang("en-US")).toBe(defaultLang.code);
    expect(matchLocaleToExcalidrawLang("en-GB")).toBe(defaultLang.code);
  });

  it("falls back through candidate list", () => {
    expect(
      resolveExcalidrawLangCode(["fr-FR", "en-US"], languages),
    ).toBe("fr-FR");
    expect(resolveExcalidrawLangCode(["xx-YY", "de-DE"], languages)).toBe(
      "de-DE",
    );
    expect(resolveExcalidrawLangCode(["xx-YY"], languages)).toBe(
      defaultLang.code,
    );
  });
});
