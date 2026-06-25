import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { FileSyncState } from "../data/FileSyncState";
import {
  resolveEditorHomeNavPlan,
  shouldNavigateAfterExitSave,
} from "../data/editorLeaveHome";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("shouldNavigateAfterExitSave", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("continues navigation when exit save reports success", () => {
    const fileId = `server-file-${crypto.randomUUID()}`;
    FileSyncState.setDraftHash(fileId, "draft");
    FileSyncState.setBaselineHash(fileId, "baseline");

    expect(shouldNavigateAfterExitSave(true, fileId)).toBe(true);
  });

  it("continues navigation when a parallel save cleaned dirty state", () => {
    const fileId = `server-file-${crypto.randomUUID()}`;
    FileSyncState.alignHashes(fileId, "same-hash");

    expect(shouldNavigateAfterExitSave(false, fileId)).toBe(true);
  });

  it("keeps navigation blocked when exit save fails and file remains dirty", () => {
    const fileId = `server-file-${crypto.randomUUID()}`;
    FileSyncState.setDraftHash(fileId, "draft");
    FileSyncState.setBaselineHash(fileId, "baseline");

    expect(shouldNavigateAfterExitSave(false, fileId)).toBe(false);
  });
});

describe("resolveEditorHomeNavPlan", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("prompts unedited local drafts before discarding", () => {
    const fileId = `local-draft:${crypto.randomUUID()}`;
    FileSyncState.alignHashes(fileId, "same");

    expect(resolveEditorHomeNavPlan(fileId, { kind: "mindmap" })).toEqual({
      action: "prompt-leave",
    });
  });
});

describe("useAppShellGoHomeListener source contract", () => {
  it("routes leave decisions through confirmEditorLeaveForFile", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "useAppShellGoHomeListener.ts"),
      "utf8",
    );

    expect(source).toContain("resolveEditorHomeNavPlan");
    expect(source).toContain("confirmEditorLeaveForFile");
    expect(source).not.toContain("promptLeaveEditorConfirm");
    expect(source).not.toContain("isAutoSaveOnExitActive");
    expect(source).not.toContain("window.confirm(");
  });
});
