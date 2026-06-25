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
    expect(source).toContain("{ checkpointPolicy, source }");
  });

  it("does not adopt hydrate baseline while unsaved user edits exist", () => {
    const shellSource = fs.readFileSync(
      path.join(__dirname, "MindMapEditorShell.tsx"),
      "utf8",
    );
    expect(shellSource).toContain("shouldSkipMindMapHydrateSettleBaselineAdopt");
    expect(shellSource).toContain("host.hydrateSettleEnd.skipAdoptBaseline");
    expect(shellSource).toContain("host.queueAutoSave.bypassIdlePolicyDueToRequestId");
    expect(shellSource).toContain("host.activeEditorSave.requested");
  });
});
