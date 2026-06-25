import { describe, expect, it } from "vitest";

import { normalizeMindMapTheme } from "./mindMapThemeNormalize.js";

describe("normalizeMindMapTheme", () => {
  it("keeps object theme with template and config", () => {
    expect(
      normalizeMindMapTheme({ template: "mint", config: { lineWidth: 2 } }),
    ).toEqual({
      template: "mint",
      config: { lineWidth: 2 },
    });
  });

  it("converts string theme to template object", () => {
    expect(normalizeMindMapTheme("classic4")).toEqual({
      template: "classic4",
      config: {},
    });
  });

  it("falls back when theme is missing", () => {
    expect(normalizeMindMapTheme(undefined, "default")).toEqual({
      template: "default",
      config: {},
    });
  });
});
