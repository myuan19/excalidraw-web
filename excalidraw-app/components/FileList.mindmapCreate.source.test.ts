import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("FileList MindMap creation source contract", () => {
  it("creates MindMap files without saving the simplified fallback thumbnail", () => {
    const source = fs.readFileSync(path.join(__dirname, "FileList.tsx"), "utf8");
    const mindMapBranch = source.slice(
      source.indexOf('if (newDocumentKind === "mindmap")'),
      source.indexOf("const id = await createFileOnServer"),
    );

    expect(mindMapBranch).toContain("const mindMapData = MindMapAdapter.createEmpty()");
    expect(mindMapBranch).not.toContain("buildMindMapThumbnailSvg");
    expect(mindMapBranch).not.toContain("LocalThumbnailCache.set(created.id");
    expect(mindMapBranch).toContain(
      "await ServerSync.saveFileImmediate(created.id, document, name)",
    );
    expect(mindMapBranch).not.toContain(
      "await ServerSync.saveFileImmediate(created.id, document, name, thumbnail)",
    );
  });
});
