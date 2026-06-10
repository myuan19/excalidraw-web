import { describe, expect, it } from "vitest";

import { decideRemoteFileRefresh } from "./remoteFileRefreshPolicy";

describe("decideRemoteFileRefresh", () => {
  it("ignores saves for other files", () => {
    expect(
      decideRemoteFileRefresh({
        currentFileId: "file-1",
        savedFileId: "file-2",
        hasUnsavedChanges: false,
      }),
    ).toBe("ignore");
  });

  it("reports conflict before reloading over local edits", () => {
    expect(
      decideRemoteFileRefresh({
        currentFileId: "file-1",
        savedFileId: "file-1",
        hasUnsavedChanges: true,
      }),
    ).toBe("conflict");
  });

  it("reloads current clean file when hashes are unavailable", () => {
    expect(
      decideRemoteFileRefresh({
        currentFileId: "file-1",
        savedFileId: "file-1",
        hasUnsavedChanges: false,
      }),
    ).toBe("reload");
  });

  it("reloads current clean file when remote hash differs", () => {
    expect(
      decideRemoteFileRefresh({
        currentFileId: "file-1",
        savedFileId: "file-1",
        hasUnsavedChanges: false,
        localServerHash: "old",
        remoteHash: "new",
      }),
    ).toBe("reload");
  });

  it("ignores current clean file when remote hash matches", () => {
    expect(
      decideRemoteFileRefresh({
        currentFileId: "file-1",
        savedFileId: "file-1",
        hasUnsavedChanges: false,
        localServerHash: "same",
        remoteHash: "same",
      }),
    ).toBe("ignore");
  });
});
