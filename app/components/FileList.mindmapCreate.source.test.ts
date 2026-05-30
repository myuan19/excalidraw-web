import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("MindMap editor plugin host actions", () => {
  it("creates MindMap files with an eagerly saved thumbnail", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../editors/mindmap/hostActions.ts"),
      "utf8",
    );

    expect(source).toContain("const mindMapData = MindMapAdapter.createEmpty()");
    expect(source).toContain("generateMindMapThumbnailAndCache");
    expect(source).toContain(
      "await ServerSync.saveFileImmediate(created.id, document, name, thumbnail)",
    );
  });

  it("imports MindMap files with the same eager thumbnail save path", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../editors/mindmap/hostActions.ts"),
      "utf8",
    );

    expect(source).toContain("saveMindMapBrowserViewFromData");
    expect(source).toContain("generateMindMapThumbnailAndCache");
    expect(source).toContain(
      "await ServerSync.saveFileImmediate(\n    created.id,\n    document,\n    fileName,\n    thumbnail,",
    );
  });
});
