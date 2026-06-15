import { describe, expect, it } from "vitest";

import {
  AI_RICH_TEXT_SPAN_FIELDS,
  buildStyledOutputExamples,
  buildStyleSchemaText,
  buildTextSchemaSuffix,
  buildVisualReferenceText,
} from "./aiRichTextCapability";

describe("aiRichTextCapability", () => {
  it("documents formula alongside other span fields", () => {
    expect(AI_RICH_TEXT_SPAN_FIELDS).toContain("formula");
    expect(buildStyleSchemaText()).toContain("formula");
    expect(buildTextSchemaSuffix()).toContain("formula");
  });

  it("styled examples cover italic and formula", () => {
    const examples = buildStyledOutputExamples();
    expect(examples).toContain('"italic":true');
    expect(examples).toContain('"formula":"E=mc^2"');
  });

  it("visual reference states node line colors are read-only", () => {
    expect(buildVisualReferenceText()).toContain("lineColor");
    expect(buildVisualReferenceText()).toContain("只读");
  });
});
