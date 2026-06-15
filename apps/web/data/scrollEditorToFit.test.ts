import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("scrollEditorToFit", () => {
  it("does not use fitToViewport zoom-in for small scenes", () => {
    const source = readFileSync(join(__dirname, "scrollEditorToFit.ts"), "utf8");
    expect(source).toContain("fitToViewport: false");
    expect(source).toContain("maxZoom: 1");
    expect(source).not.toMatch(/fitToViewport:\s*true/);
  });
});
