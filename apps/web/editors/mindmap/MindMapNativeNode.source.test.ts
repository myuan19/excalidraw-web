import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "../..");

function readNativeSource(relativePath: string): string {
  return fs.readFileSync(path.join(appRoot, relativePath), "utf8");
}

describe("MindMap native node source contract", () => {
  it("rechecks expand state before an async hide removes the expand button", () => {
    const source = readNativeSource(
      "editors/mindmap/native/simple-mind-map/src/core/render/node/nodeExpandBtn.js",
    );
    const hideBlock = source.slice(
      source.indexOf("function hideExpandBtn()"),
      source.indexOf("export default"),
    );
    const timeoutBlock = hideBlock.slice(
      hideBlock.indexOf("setTimeout(() => {"),
      hideBlock.indexOf("}, 0)") + "}, 0)".length,
    );

    expect(timeoutBlock).toContain("latestIsActive");
    expect(timeoutBlock).toContain("latestExpand");
    expect(timeoutBlock.indexOf("this.getData()")).toBeLessThan(
      timeoutBlock.indexOf("this.removeExpandBtn()"),
    );
  });

  it("uses a height fallback for 1px collapsed rich-text measurements", () => {
    const source = readNativeSource(
      "editors/mindmap/native/simple-mind-map/src/core/render/richText/richTextContentFactory.js",
    );
    const measureBlock = source.slice(
      source.indexOf("export function measureRichTextContent"),
      source.indexOf("export function buildRichTextNodeGroup"),
    );

    expect(measureBlock).toContain("plainTextLength > 0");
    expect(measureBlock).toContain("height <= 1");
    expect(measureBlock).toContain("collapsed height fallback");
  });
});
