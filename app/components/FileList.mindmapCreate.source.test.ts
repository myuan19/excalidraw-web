import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("FileList MindMap creation source contract", () => {
  it("creates MindMap files with an eagerly saved thumbnail", () => {
    const source = fs.readFileSync(path.join(__dirname, "FileList.tsx"), "utf8");
    const mindMapBranch = source.slice(
      source.indexOf('if (newDocumentKind === "mindmap")'),
      source.indexOf("const id = await createFileOnServer"),
    );

    expect(mindMapBranch).toContain("const mindMapData = MindMapAdapter.createEmpty()");
    expect(mindMapBranch).toContain("generateMindMapThumbnailAndCache");
    expect(mindMapBranch).toContain(
      "await ServerSync.saveFileImmediate(created.id, document, name, thumbnail)",
    );
  });

  it("imports MindMap files with the same eager thumbnail save path", () => {
    const source = fs.readFileSync(path.join(__dirname, "FileList.tsx"), "utf8");
    const importBranch = source.slice(
      source.indexOf('if (detected.kind !== "excalidraw")'),
      source.indexOf("const { elements, appState, files: sceneFiles }"),
    );

    expect(importBranch).toContain('adapter.kind === "mindmap"');
    expect(importBranch).toContain("generateMindMapThumbnailAndCache");
    expect(importBranch).toContain(
      "await ServerSync.saveFileImmediate(\n              created.id,\n              document,\n              sanitizeFileBaseName(file.name),\n              thumbnail,",
    );
  });
});
