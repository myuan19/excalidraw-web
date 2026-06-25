import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("MindMap editor snapshot source contract", () => {
  it("registers a local snapshot handler that does not use the formal save path", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "MindMapEditorShell.tsx"),
      "utf8",
    );

    expect(source).toContain("registerActiveEditorSnapshotHandler");
    expect(source).toContain("requestNativeSnapshot");
    expect(source).toContain("pendingNativeSnapshotRequestIdRef");
    expect(source).toContain("isCurrentSnapshotResponse");
    expect(source).toContain("recordMindMapDraft(fileId, document)");
    expect(source).toContain("tab-switch");
    expect(source).not.toContain('requestNativeSave("tab-switch"');
    expect(source).not.toContain('requestNativeSave("tab-close"');
  });

  it("notifies the mounted FileList after a saved thumbnail is finalized", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "MindMapEditorShell.tsx"),
      "utf8",
    );
    const finalizeIndex = source.indexOf("finalizeSavedThumbnail({");
    const afterFinalizeBlock = source.slice(
      finalizeIndex,
      source.indexOf("traceMindMapOperation(\"host.persistMindMapDocument.server.after\"", finalizeIndex),
    );

    expect(finalizeIndex).toBeGreaterThan(-1);
    expect(afterFinalizeBlock).toContain(
      'new CustomEvent("excalidraw-file-sync-state"',
    );
    expect(afterFinalizeBlock).toContain(
      'new CustomEvent("excalidraw-file-list-refresh"',
    );
    expect(source).not.toContain(
      'new CustomEvent("cross-tab-file-saved"',
    );
  });
});
