import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

function readApp(relativePath: string): string {
  return fs.readFileSync(path.join(appRoot, relativePath), "utf8");
}

describe("ArchivePanel source contract", () => {
  it("routes save/archive/restore decisions through the unified archive gate", () => {
    const source = readApp("components/ArchivePanel.tsx");

    expect(source).toContain("ArchivePanelPrompt");
    expect(source).toContain("evaluateManualArchiveGate");
    expect(source).toContain("evaluateArchiveCoverage");
    expect(source).toContain("getCheckpointLabelText");
    expect(source).toContain("onSave");
    expect(source).toContain("onArchive");
    expect(source).toContain("readCurrentModificationState");
    expect(source).toContain("ServerSync.deleteArchive");
    expect(source).toContain("backupCurrent: false");
  });

  it("lets restore opt out of backend backup because the panel owns the prompt", () => {
    const serverSync = readApp("data/ServerSync.ts");

    expect(serverSync).toContain("opts?: { backupCurrent?: boolean }");
    expect(serverSync).toContain("backupCurrent: opts?.backupCurrent !== false");
  });

  it("exposes the archive panel from both editor shells", () => {
    const excalidrawShell = readApp("editors/excalidraw/EditorShell.tsx");
    const mindMapShell = readApp("editors/mindmap/MindMapEditorShell.tsx");

    for (const source of [excalidrawShell, mindMapShell]) {
      expect(source).toContain("ArchivePanel");
      expect(source).toContain("evaluateCurrentFileModificationState");
      expect(source).toContain("ServerSync.createArchive");
      expect(source).toContain("CHECKPOINT_LABELS.manual");
      expect(source).toContain("readCurrentModificationState");
      expect(source).toContain("onArchive");
    }
  });
});
