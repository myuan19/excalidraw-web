import { afterEach, describe, expect, it } from "vitest";

import {
  getRecentFileEntries,
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
});
