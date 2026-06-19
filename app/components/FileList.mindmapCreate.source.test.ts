import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("MindMap editor plugin host actions", () => {
  it("creates MindMap files with a native-rendered thumbnail", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../editors/mindmap/hostActions.ts"),
      "utf8",
    );

    expect(source).toContain(
      "const mindMapData = createEmptyMindMapData(name)",
    );
    expect(source).toContain("generateMindMapThumbnailAndCache");
    expect(source).not.toContain("buildAndCacheFileThumbnail");
    expect(source).toContain('source: "create-mindmap"');
  });

  it("imports MindMap files with the same native thumbnail path", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../editors/mindmap/hostActions.ts"),
      "utf8",
    );

    expect(source).toContain("parseImportFileJson(file)");
    expect(source).not.toContain("saveMindMapBrowserViewFromData");
    expect(source).toContain(
      "generateMindMapThumbnailAndCache(created.id, data)",
    );
    expect(source).toContain('source: "import-mindmap"');
  });
});
