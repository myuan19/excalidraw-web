import { beforeEach, describe, expect, it } from "vitest";

import { FileSyncState } from "./FileSyncState";
import {
  getEditSessionBadge,
  markEditSessionEdited,
  markEditSessionOpened,
} from "./editSessionService";

describe("editSessionService", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("marks interrupted sessions when dirty and not closed cleanly", () => {
    const fileId = "file-interrupted";
    FileSyncState.setBaselineHash(fileId, "baseline");
    FileSyncState.setDraftHash(fileId, "draft");
    markEditSessionOpened(fileId);
    markEditSessionEdited(fileId);
    expect(getEditSessionBadge(fileId)).toBe("interrupted");
  });

  it("returns draft when dirty after clean close flag from prior session", () => {
    const fileId = "file-draft";
    FileSyncState.setBaselineHash(fileId, "baseline");
    FileSyncState.setDraftHash(fileId, "draft");
    markEditSessionOpened(fileId);
    markEditSessionEdited(fileId);
    sessionStorage.setItem(
      `editorhub-edit-session-v1-${fileId}`,
      JSON.stringify({ closedCleanly: true, openedAt: new Date().toISOString() }),
    );
    expect(getEditSessionBadge(fileId)).toBe("draft");
  });
});
