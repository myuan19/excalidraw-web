import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

function read(relPath: string): string {
  return fs.readFileSync(path.join(webRoot, relPath), "utf8");
}

describe("active editor save architecture source contract", () => {
  it("routes active editor saves through a shared bridge", () => {
    const excalidrawShell = read("editors/excalidraw/EditorShell.tsx");
    const mindMapShell = read("editors/mindmap/MindMapEditorShell.tsx");
    const sidebar = read("components/EditorPlatformSidebar.tsx");
    const leaveFlow = read("shell/editorLeaveFlow.ts");

    expect(excalidrawShell).toContain("registerEditorTabSaveHandler");
    expect(mindMapShell).toContain("registerEditorTabSaveHandler");
    expect(sidebar).toContain("requestActiveEditorSave");
    expect(leaveFlow).toContain("requestEditorTabSave");
    expect(leaveFlow).toContain("requestEditorTabDiscard");
    expect(excalidrawShell).toContain("registerEditorTabDiscardHandler");
    expect(mindMapShell).toContain("registerEditorTabDiscardHandler");
  });

  it("keeps local draft state separate from committed saves in active editors", () => {
    const excalidrawShell = read("editors/excalidraw/EditorShell.tsx");
    const mindMapShell = read("editors/mindmap/MindMapEditorShell.tsx");

    expect(excalidrawShell).toContain("evaluateCurrentFileModificationState");
    expect(excalidrawShell).toContain("applyFileModificationState");
    expect(excalidrawShell).toContain("markDocumentCommitted");
    expect(mindMapShell).toContain("recordMindMapDraft");
    expect(mindMapShell).toContain("markDocumentCommitted");
  });

  it("finalizes session thumbnails after committed saves", () => {
    const excalidrawShell = read("editors/excalidraw/EditorShell.tsx");
    const mindMapShell = read("editors/mindmap/MindMapEditorShell.tsx");

    expect(excalidrawShell).toContain("finalizeSavedThumbnail");
    expect(mindMapShell).toContain("finalizeSavedThumbnail");
  });

  it("uses app autosave settings instead of unconditional server saves", () => {
    const excalidrawShell = read("editors/excalidraw/EditorShell.tsx");
    const mindMapShell = read("editors/mindmap/MindMapEditorShell.tsx");
    const leaveFlow = read("shell/editorLeaveFlow.ts");

    expect(excalidrawShell).toContain("getAppSettings");
    expect(excalidrawShell).toContain("autoSaveIdleSec");
    expect(mindMapShell).toContain("getAppSettings");
    expect(mindMapShell).toContain("autoSaveIdleSec");
    expect(leaveFlow).toContain("isAutoSaveOnExitActive");
  });

  it("formalizes local drafts before saving to the server", () => {
    const excalidrawShell = read("editors/excalidraw/EditorShell.tsx");
    const mindMapShell = read("editors/mindmap/MindMapEditorShell.tsx");

    for (const source of [excalidrawShell, mindMapShell]) {
      expect(source).toContain("isLocalDraftFileId");
      expect(source).toContain("saveNewDocument");
    }
  });

  it("handles save version conflicts through the shared platform dialog boundary", () => {
    const excalidrawShell = read("editors/excalidraw/EditorShell.tsx");
    const mindMapShell = read("editors/mindmap/MindMapEditorShell.tsx");
    const conflictSource = read("shell/editorSaveConflict.ts");

    expect(excalidrawShell).toContain("resolveEditorSaveConflict");
    expect(mindMapShell).toContain("resolveEditorSaveConflict");
    expect(conflictSource).toContain("isServerSyncVersionConflictError");
    expect(conflictSource).toContain("promptServerUpdateConfirm");
    expect(conflictSource).toContain('mode: "save-conflict"');
    expect(conflictSource).toContain("forceOverwrite");
  });
});
