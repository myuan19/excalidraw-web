import { afterEach, describe, expect, it } from "vitest";

import {
  getRecentFileEntries,
  getRecentPathFromEntryId,
  isRecentPathEntry,
  pickRecentEntriesExcluding,
  promoteRecentCatalogFile,
  recordRecentFileAccess,
  recordRecentFilePath,
  RECENT_FILES_KEY,
  toRecentPathEntryId,
} from "./recentFiles";

describe("recentFiles", () => {
  beforeEach(() => {
    localStorage.removeItem(RECENT_FILES_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(RECENT_FILES_KEY);
  });

  it("records access and returns newest first within three days", () => {
    recordRecentFileAccess("file-a");
    recordRecentFileAccess("file-b");
    recordRecentFileAccess("file-a");

    const entries = getRecentFileEntries();
    expect(entries.map((entry) => entry.id)).toEqual(["file-a", "file-b"]);
  });

  it("pickRecentEntriesExcluding skips current file and still returns limit", () => {
    recordRecentFileAccess("open-now");
    recordRecentFileAccess("other-1");
    recordRecentFileAccess("other-2");
    recordRecentFileAccess("other-3");

    const picked = pickRecentEntriesExcluding(getRecentFileEntries(), {
      excludeFileId: "open-now",
      limit: 2,
    });
    expect(picked.map((e) => e.id)).toEqual(["other-3", "other-2"]);
  });

  it("drops entries older than three days", () => {
    const old = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(
      RECENT_FILES_KEY,
      JSON.stringify([{ id: "stale", accessedAt: old }]),
    );
    recordRecentFileAccess("fresh");

    const ids = getRecentFileEntries().map((entry) => entry.id);
    expect(ids[0]).toBe("fresh");
    expect(ids).not.toContain("stale");
  });

  it("stores path-based recent entries with a stable prefix", () => {
    recordRecentFilePath("C:/EditorHubData/demo.smm");

    const entries = getRecentFileEntries();
    expect(entries[0]?.id).toBe(toRecentPathEntryId("C:/EditorHubData/demo.smm"));
    expect(isRecentPathEntry(entries[0]!.id)).toBe(true);
    expect(getRecentPathFromEntryId(entries[0]!.id)).toBe(
      "C:/EditorHubData/demo.smm",
    );
  });

  it("promotes a catalog file id while removing the local draft entry", () => {
    recordRecentFileAccess("local-draft:draft-1");
    recordRecentFileAccess("other-file");

    promoteRecentCatalogFile("local-draft:draft-1", "server-file");

    expect(getRecentFileEntries().map((entry) => entry.id)).toEqual([
      "server-file",
      "other-file",
    ]);
  });
});
