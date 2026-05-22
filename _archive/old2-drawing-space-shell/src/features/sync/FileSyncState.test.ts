import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileSyncState } from "./FileSyncState";

function installStorage() {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  vi.stubGlobal("window", {
    dispatchEvent: vi.fn(),
  });
}

describe("FileSyncState", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    installStorage();
  });

  it("uses draft hash versus baseline hash to detect unsaved changes", () => {
    FileSyncState.markOpened("file-a", "server-a");
    FileSyncState.markDraft("file-a", "draft-a");
    FileSyncState.markServerHash("file-a", "draft-a");

    expect(FileSyncState.getSyncState("file-a")).toBe("draft");
  });

  it("can align baseline and draft after a confirmed save", () => {
    FileSyncState.markOpened("file-a", "server-a");
    FileSyncState.markDraft("file-a", "draft-a");

    FileSyncState.alignHashes("file-a", "saved-a");

    expect(FileSyncState.get("file-a")).toMatchObject({
      baselineHash: "saved-a",
      draftHash: "saved-a",
      serverHash: "saved-a",
    });
    expect(FileSyncState.getSyncState("file-a")).toBe("synced");
  });

  it("tracks server newer changes separately from local draft state", () => {
    FileSyncState.alignHashes("file-a", "server-a");

    expect(FileSyncState.isServerChanged("file-a", "server-b")).toBe(true);
    expect(FileSyncState.isServerChanged("file-a", "server-a")).toBe(false);
  });
});
