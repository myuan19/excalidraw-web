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

    expect(source).toContain("const mindMapData = createEmptyMindMapData(name)");
    expect(source).toContain("generateMindMapThumbnailAndCache");
    expect(source).toContain(
      "await ServerSync.saveFileImmediate(\n    created.id,\n    document,\n    name,\n    thumbnail,\n  )",
    );
  });

  it("imports MindMap files with the same eager thumbnail save path", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../editors/mindmap/hostActions.ts"),
      "utf8",
    );

    expect(source).toContain("parseImportFileJson(file)");
    expect(source).not.toContain("saveMindMapBrowserViewFromData");
    expect(source).toContain("generateMindMapThumbnailAndCache");
    expect(source).toContain("created.id,\n    data");
    expect(source).toContain(
      "await ServerSync.saveFileImmediate(\n    created.id,\n    document,\n    name,\n    thumbnail,\n  )",
    );
  });
});
