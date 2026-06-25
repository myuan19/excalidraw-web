import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Excalidraw editor snapshot source contract", () => {
  it("registers a local snapshot handler for tab switching", () => {
    const source = fs.readFileSync(path.join(__dirname, "EditorShell.tsx"), "utf8");

    expect(source).toContain("registerActiveEditorSnapshotHandler");
    expect(source).toContain("pendingSnapshotSceneRef");
    expect(source).toContain("persistLocalExcalidrawSnapshot");
    expect(source).toContain("cacheExcalidrawDraft");
    expect(source).toContain("tab-switch");
    expect(source).not.toContain('saveCurrentDocument("tab-switch"');
    expect(source).not.toContain("saveFileImmediate(fileId");
  });
});
