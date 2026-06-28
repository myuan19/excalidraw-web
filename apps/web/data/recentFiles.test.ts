import { afterEach, describe, expect, it } from "vitest";

import {
  getRecentFileEntries,
  getRecentPathForFileId,
  getRecentPathFromEntryId,
  isRecentPathEntry,
  pickRecentEntriesExcluding,
  promoteRecentCatalogFile,
  RECENT_FILE_PATHS_KEY,
  RECENT_FILES_KEY,
  resolveRecentEntryToFileId,
  findRecentPathCatalogFile,
  touchRecentOpenedFile,
  touchRecentTrackedFiles,
  bumpRecentEditOrder,
  toRecentPathEntryId,
} from "./recentFiles";

describe("recentFiles", () => {
  beforeEach(() => {
    localStorage.removeItem(RECENT_FILES_KEY);
    localStorage.removeItem(RECENT_FILE_PATHS_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(RECENT_FILES_KEY);
    localStorage.removeItem(RECENT_FILE_PATHS_KEY);
  });

  it("records access and returns newest first within three days", () => {
    touchRecentOpenedFile({ fileId: "file-a" });
    touchRecentOpenedFile({ fileId: "file-b" });
    touchRecentOpenedFile({ fileId: "file-a" });

    const entries = getRecentFileEntries();
    expect(entries.map((entry) => entry.id)).toEqual(["file-a", "file-b"]);
  });

  it("pickRecentEntriesExcluding skips current file and still returns limit", () => {
    touchRecentOpenedFile({ fileId: "open-now" });
    touchRecentOpenedFile({ fileId: "other-1" });
    touchRecentOpenedFile({ fileId: "other-2" });
    touchRecentOpenedFile({ fileId: "other-3" });

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
    touchRecentOpenedFile({ fileId: "fresh" });

    const ids = getRecentFileEntries().map((entry) => entry.id);
    expect(ids[0]).toBe("fresh");
    expect(ids).not.toContain("stale");
  });

  it("stores path-based recent entries with a stable prefix", () => {
    touchRecentOpenedFile({ absPath: "C:/EditorHubData/demo.smm" });

    const entries = getRecentFileEntries();
    expect(entries[0]?.id).toBe(toRecentPathEntryId("C:/EditorHubData/demo.smm"));
    expect(isRecentPathEntry(entries[0]!.id)).toBe(true);
    expect(getRecentPathFromEntryId(entries[0]!.id)).toBe(
      "C:/EditorHubData/demo.smm",
    );
  });

  it("promotes a catalog file id while removing the local draft entry", () => {
    touchRecentOpenedFile({ fileId: "local-draft:draft-1" });
    touchRecentOpenedFile({ fileId: "other-file" });

    promoteRecentCatalogFile("local-draft:draft-1", "server-file");

    expect(getRecentFileEntries().map((entry) => entry.id)).toEqual([
      "server-file",
      "other-file",
    ]);
  });

  it("touchRecentOpenedFile dedupes path and catalog ids and moves to front", () => {
    touchRecentOpenedFile({ fileId: "file-a" });
    touchRecentOpenedFile({ absPath: "C:/data/demo.smm" });
    touchRecentOpenedFile({ fileId: "file-b" });

    touchRecentOpenedFile({
      fileId: "file-c",
      absPath: "C:/data/demo.smm",
    });

    expect(getRecentFileEntries().map((entry) => entry.id)).toEqual([
      toRecentPathEntryId("C:/data/demo.smm"),
      "file-b",
      "file-a",
    ]);
  });

  it("touchRecentOpenedFile bumps an existing catalog entry to the front", () => {
    touchRecentOpenedFile({ fileId: "file-a" });
    touchRecentOpenedFile({ fileId: "file-b" });
    touchRecentOpenedFile({ fileId: "file-c" });

    touchRecentOpenedFile({ fileId: "file-b" });

    expect(getRecentFileEntries().map((entry) => entry.id)).toEqual([
      "file-b",
      "file-c",
      "file-a",
    ]);
  });

  it("bumpRecentEditOrder throttles repeated bumps unless forced", () => {
    touchRecentOpenedFile({ fileId: "file-a" });
    touchRecentOpenedFile({ fileId: "file-b" });
    touchRecentOpenedFile({ fileId: "file-c" });

    bumpRecentEditOrder({ fileId: "file-a" });
    expect(getRecentFileEntries().map((entry) => entry.id)[0]).toBe("file-a");

    bumpRecentEditOrder({ fileId: "file-a" });
    expect(getRecentFileEntries().map((entry) => entry.id)[0]).toBe("file-a");

    bumpRecentEditOrder({ fileId: "file-b" }, { force: true });
    expect(getRecentFileEntries().map((entry) => entry.id)).toEqual([
      "file-b",
      "file-a",
      "file-c",
    ]);
  });

  it("reuses stored path mapping when bumping by file id only", () => {
    touchRecentOpenedFile({
      fileId: "file-a",
      absPath: "C:/data/demo.smm",
    });
    touchRecentOpenedFile({ fileId: "file-b" });
    touchRecentOpenedFile({ fileId: "file-a" });

    expect(getRecentFileEntries().map((entry) => entry.id)).toEqual([
      toRecentPathEntryId("C:/data/demo.smm"),
      "file-b",
    ]);
    expect(getRecentPathForFileId("file-a")).toBe("C:/data/demo.smm");
  });

  it("touchRecentTrackedFiles preserves input order with the first path at the front", () => {
    touchRecentOpenedFile({ fileId: "existing" });
    touchRecentTrackedFiles([
      { fileId: "first", absPath: "C:/a.smm" },
      { fileId: "second", absPath: "C:/b.smm" },
    ]);

    expect(getRecentFileEntries().map((entry) => entry.id)).toEqual([
      toRecentPathEntryId("C:/a.smm"),
      toRecentPathEntryId("C:/b.smm"),
      "existing",
    ]);
  });

  it("findRecentPathCatalogFile matches paths case- and slash-insensitively", () => {
    const catalog = {
      "C:/data/demo.smm": { id: "file-1" },
    };
    expect(findRecentPathCatalogFile(catalog, "c:\\data\\demo.smm")?.file.id).toBe(
      "file-1",
    );
  });

  it("resolveRecentEntryToFileId maps orphan catalog ids through path registry", () => {
    touchRecentOpenedFile({
      fileId: "file-a",
      absPath: "C:/data/demo.smm",
    });
    localStorage.setItem(
      RECENT_FILES_KEY,
      JSON.stringify([
        { id: "file-a", accessedAt: new Date().toISOString() },
      ]),
    );

    const fileId = resolveRecentEntryToFileId(
      { id: "file-a", accessedAt: new Date().toISOString() },
      {
        filesById: new Map(),
        recentPathCatalogFiles: {
          "C:/data/demo.smm": { id: "file-a" },
        },
      },
    );

    expect(fileId).toBe("file-a");
  });
});
