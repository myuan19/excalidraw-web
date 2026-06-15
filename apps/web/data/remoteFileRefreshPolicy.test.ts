import { describe, expect, it } from "vitest";

import { decideRemoteFileRefresh } from "./remoteFileRefreshPolicy";

describe("decideRemoteFileRefresh", () => {
  it("ignores saves for other files", () => {
    expect(
      decideRemoteFileRefresh({
        currentFileId: "file-1",
        savedFileId: "file-2",
        tabHasUnsavedChanges: false,
      }),
    ).toBe("ignore");
  });

  it("ignores when current file id is missing", () => {
    expect(
      decideRemoteFileRefresh({
        currentFileId: null,
        savedFileId: "file-1",
        tabHasUnsavedChanges: false,
      }),
    ).toBe("ignore");
  });

  it("reloads when this tab has no unsaved changes", () => {
    expect(
      decideRemoteFileRefresh({
        currentFileId: "file-1",
        savedFileId: "file-1",
        tabHasUnsavedChanges: false,
      }),
    ).toBe("reload");
  });

  it("prompts when this tab has unsaved changes", () => {
    expect(
      decideRemoteFileRefresh({
        currentFileId: "file-1",
        savedFileId: "file-1",
        tabHasUnsavedChanges: true,
      }),
    ).toBe("prompt");
  });

  it("does not re-prompt for a version the user already dismissed", () => {
    expect(
      decideRemoteFileRefresh({
        currentFileId: "file-1",
        savedFileId: "file-1",
        tabHasUnsavedChanges: true,
        savedSha: "sha-a",
        dismissedSha: "sha-a",
      }),
    ).toBe("ignore");
  });

  it("prompts again when a newer version arrives after dismissal", () => {
    expect(
      decideRemoteFileRefresh({
        currentFileId: "file-1",
        savedFileId: "file-1",
        tabHasUnsavedChanges: true,
        savedSha: "sha-b",
        dismissedSha: "sha-a",
      }),
    ).toBe("prompt");
  });

  it("prompts when broadcast carries no sha even after dismissal", () => {
    expect(
      decideRemoteFileRefresh({
        currentFileId: "file-1",
        savedFileId: "file-1",
        tabHasUnsavedChanges: true,
        savedSha: null,
        dismissedSha: "sha-a",
      }),
    ).toBe("prompt");
  });
});
