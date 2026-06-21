import { afterEach, describe, expect, it } from "vitest";

import {
  getRecentFileEntries,
  pickRecentEntriesExcluding,
  promoteRecentCatalogFile,
  recordRecentFileAccess,
  RECENT_FILES_KEY,
} from "./recentFiles";

describe("recentFiles", () => {
  beforeEach(() => {
    localStorage.removeItem(RECENT_FILES_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(RECENT_FILES_KEY);
  });

  it("records access and returns newest first within seven days", () => {
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

  it("drops entries older than seven days", () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(
      RECENT_FILES_KEY,
      JSON.stringify([{ id: "stale", accessedAt: old }]),
    );
    recordRecentFileAccess("fresh");

    const ids = getRecentFileEntries().map((entry) => entry.id);
    expect(ids[0]).toBe("fresh");
    expect(ids).not.toContain("stale");
  });

  it("promoteRecentCatalogFile replaces draft entry with server file id", () => {
    recordRecentFileAccess("other-doc");
    recordRecentFileAccess("local-draft:abc");

    promoteRecentCatalogFile("local-draft:abc", "server-file-1");

    expect(getRecentFileEntries().map((entry) => entry.id)).toEqual([
      "server-file-1",
      "other-doc",
    ]);
  });
});
