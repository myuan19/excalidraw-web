import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("MindMapEditorShell local-draft autosave source contract", () => {
  it("does not promote local-draft on idle autosave (matches autoSaveSession)", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "MindMapEditorShell.tsx"),
      "utf8",
    );
    expect(source).toContain("shouldFormalizeLocalDraft");

    const policySource = fs.readFileSync(
      path.join(__dirname, "mindMapLocalDraftSavePolicy.ts"),
      "utf8",
    );
    expect(policySource).toContain('source === "manual" || source === "exit"');
    expect(policySource).toContain('source === "auto" && hasRequestId');
    expect(policySource).toContain('source === "auto" && !hasRequestId');
  });

  it("passes save source to the server PUT diagnostics path", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "useMindMapFileSave.ts"),
      "utf8",
    );
    expect(source).toContain("ServerSync.saveFileImmediate");
    expect(source).toContain("checkpointPolicy");
    expect(source).toContain("source,");
  });

  it("does not adopt hydrate baseline while unsaved user edits exist", () => {
    const shellSource = fs.readFileSync(
      path.join(__dirname, "MindMapEditorShell.tsx"),
      "utf8",
    );
    expect(shellSource).toContain("shouldSkipMindMapHydrateSettleBaselineAdopt");
    expect(shellSource).toContain("host.hydrateSettleEnd.skipAdoptBaseline");
    expect(shellSource).toContain("host.queueAutoSave.bypassIdlePolicyDueToRequestId");
    expect(shellSource).toContain("host.queueAutoSave.requestNativeSnapshot");
    expect(shellSource).toContain("beginMindMapNativeSavePaneBoost");
    expect(shellSource).toContain("waitForMindMapNativeSavePaneBoost");
    expect(shellSource).toContain("mountNativeFrame");
    expect(shellSource).toContain("beforeDirtyCheck: flushDraft");
    expect(shellSource).toContain("rearmKey: isPaneForeground");
    expect(shellSource).toContain("allowInactiveFile: !!pinnedFileId");
    expect(shellSource).toContain("queueAutoSave(pendingData)");
    expect(shellSource).not.toContain('void requestNativeSave("auto")');
    expect(shellSource).not.toContain("useIdleAutoSaveRearm(\n    fileId,\n    isEditorTabActive");
    expect(shellSource).toContain("host.activeEditorSave.requested");
  });

  it("flushes pending draft fingerprints before background dirty checks", () => {
    const shellSource = fs.readFileSync(
      path.join(__dirname, "MindMapEditorShell.tsx"),
      "utf8",
    );
    const inactiveFlushBlock = shellSource.slice(
      shellSource.indexOf("const flushMindMapAutoSaveWhenInactive = useCallback("),
      shellSource.indexOf("const handleOpenHydrateReady"),
    );
    expect(inactiveFlushBlock.indexOf("flushDraft();")).toBeGreaterThan(-1);
    expect(inactiveFlushBlock.indexOf("flushDraft();")).toBeLessThan(
      inactiveFlushBlock.indexOf("FileSyncState.hasUnsavedChanges(fileId)"),
    );
  });

  it("routes idle autosave through native snapshot instead of host draft data", () => {
    const shellSource = fs.readFileSync(
      path.join(__dirname, "MindMapEditorShell.tsx"),
      "utf8",
    );
    const queueAutoSaveBlock = shellSource.slice(
      shellSource.indexOf("const queueAutoSave = useCallback("),
      shellSource.indexOf("useIdleAutoSaveRearm("),
    );
    expect(queueAutoSaveBlock).toContain(
      "host.queueAutoSave.requestNativeSnapshot",
    );
    expect(queueAutoSaveBlock).toContain('requestNativeSaveRef.current?.("auto")');
    const idlePersistIndex = queueAutoSaveBlock.indexOf(
      "void persistMindMapDocument(",
    );
    const nativeSnapshotIndex = queueAutoSaveBlock.indexOf(
      "host.queueAutoSave.requestNativeSnapshot",
    );
    expect(nativeSnapshotIndex).toBeGreaterThan(-1);
    expect(idlePersistIndex).toBeGreaterThan(nativeSnapshotIndex);
  });
});
