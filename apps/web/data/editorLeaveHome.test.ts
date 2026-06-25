import { afterEach, describe, expect, it } from "vitest";

import { FileSyncState } from "./FileSyncState";
import {
  resolveEditorHomeNavPlan,
  shouldDeferLeaveWhileNewDocumentHash,
  shouldPromptEditorHomeNavDialog,
} from "./editorLeaveHome";

describe("editorLeaveHome", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("prompts for local-draft even before it has edits", () => {
    const id = `local-draft:${crypto.randomUUID()}`;
    expect(shouldPromptEditorHomeNavDialog(id)).toBe(true);
    FileSyncState.setDraftHash(id, "hash-a");
    FileSyncState.setBaselineHash(id, "hash-b");
    expect(shouldPromptEditorHomeNavDialog(id)).toBe(true);
  });

  it("resolves unedited local-draft leave as prompt before discard", () => {
    const id = `local-draft:${crypto.randomUUID()}`;
    FileSyncState.alignHashes(id, "same-hash");
    expect(resolveEditorHomeNavPlan(id, { kind: "mindmap" })).toEqual({
      action: "prompt-leave",
    });
    FileSyncState.setDraftHash(id, "dirty");
    FileSyncState.setBaselineHash(id, "baseline");
    expect(resolveEditorHomeNavPlan(id, { kind: "mindmap" })).toEqual({
      action: "prompt-leave",
    });
  });

  it("prompts server file only when draft sync state", () => {
    const id = `server-file-${crypto.randomUUID()}`;
    expect(shouldPromptEditorHomeNavDialog(id)).toBe(false);
    FileSyncState.setDraftHash(id, "hash-a");
    FileSyncState.setBaselineHash(id, "hash-b");
    expect(shouldPromptEditorHomeNavDialog(id)).toBe(true);
  });

  it("defers leave while new-document hash has no file id", () => {
    expect(shouldDeferLeaveWhileNewDocumentHash(null, "#new=1&kind=mindmap")).toBe(
      true,
    );
    expect(
      shouldDeferLeaveWhileNewDocumentHash(
        "local-draft:abc",
        "#file=local-draft:abc",
      ),
    ).toBe(false);
  });
});
