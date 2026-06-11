import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  normalizeRichTextThemeWeight,
  RICH_TEXT_SEMANTIC_BOLD_CSS,
  RICH_TEXT_THEME_WEIGHT,
} from "./native/simple-mind-map/src/constants/richTextFontWeightStyle.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("richTextFontWeightStyle", () => {
  it("normalizes theme font weight to bold or normal", () => {
    expect(normalizeRichTextThemeWeight("bold")).toBe(
      RICH_TEXT_THEME_WEIGHT.BOLD,
    );
    expect(normalizeRichTextThemeWeight(700)).toBe(RICH_TEXT_THEME_WEIGHT.BOLD);
    expect(normalizeRichTextThemeWeight("normal")).toBe(
      RICH_TEXT_THEME_WEIGHT.NORMAL,
    );
    expect(normalizeRichTextThemeWeight(400)).toBe(
      RICH_TEXT_THEME_WEIGHT.NORMAL,
    );
  });

  it("avoids double-bold synthesis with inherit + conditional explicit bold", () => {
    expect(RICH_TEXT_SEMANTIC_BOLD_CSS).toContain("font-weight: inherit");
    expect(RICH_TEXT_SEMANTIC_BOLD_CSS).toContain('data-theme-weight="normal"');
    expect(RICH_TEXT_SEMANTIC_BOLD_CSS).toContain("font-synthesis: none");
  });

  it("is wired into rich text render and edit paths", () => {
    const renderSource = fs.readFileSync(
      path.join(
        __dirname,
        "native/simple-mind-map/src/core/render/node/nodeCreateContents.js",
      ),
      "utf8",
    );
    const richTextSource = fs.readFileSync(
      path.join(
        __dirname,
        "native/simple-mind-map/src/plugins/RichText.js",
      ),
      "utf8",
    );

    expect(renderSource).toContain("applyRichTextThemeWeightMarker");
    expect(richTextSource).toContain("RICH_TEXT_SEMANTIC_BOLD_CSS");
    expect(richTextSource).toContain("applyRichTextThemeWeightMarker");
  });
});
