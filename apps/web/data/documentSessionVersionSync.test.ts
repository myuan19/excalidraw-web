import { beforeEach, describe, expect, it, vi } from "vitest";

import { FileSyncState } from "./FileSyncState";
import {
  clearDocumentSessionVersion,
  getDocumentSessionVersion,
  setDocumentSessionVersion,
} from "./documentSessionVersion";
import {
  applyServerFileSessionVersion,
  ensureSessionVersionAfterCacheOpen,
  reconcileSessionVersionFromHashList,
  supplementSessionVersionIfMissing,
  updateLocalCacheServerVersionMeta,
} from "./documentSessionVersionSync";

const FILE_ID = "file-sync-test";

describe("documentSessionVersionSync", () => {
  beforeEach(() => {
    clearDocumentSessionVersion(FILE_ID, "test-reset");
    FileSyncState.clearLocalCache(FILE_ID);
    FileSyncState.clearHashStateForFile(FILE_ID);
    vi.restoreAllMocks();
  });

  it("applyServerFileSessionVersion sets session from server version", () => {
    applyServerFileSessionVersion(FILE_ID, 7, "getFile");
    expect(getDocumentSessionVersion(FILE_ID)).toBe(7);
  });

  it("ensureSessionVersionAfterCacheOpen reconciles before cache meta fallback", async () => {
    const listFileHashes = vi
      .fn()
      .mockResolvedValue([
        { id: FILE_ID, content_sha256: "fresh-sha", version: 13 },
      ]);
    await ensureSessionVersionAfterCacheOpen(FILE_ID, {
      listFileHashes,
      cacheVersion: 12,
      hasUnsavedChanges: false,
      cachedServerSha: "fresh-sha",
      reason: "open-cache",
    });
    expect(getDocumentSessionVersion(FILE_ID)).toBe(13);
    expect(listFileHashes).toHaveBeenCalledOnce();
  });

  it("ensureSessionVersionAfterCacheOpen falls back to cache meta when reconcile fails", async () => {
    FileSyncState.setLocalCache(FILE_ID, {
      elements: [],
      appState: {},
      files: {},
      deltas: [],
      meta: { serverContentSha256: "local-cache-sha", serverVersion: 12 },
    });
    const listFileHashes = vi.fn().mockRejectedValue(new Error("offline"));
    await ensureSessionVersionAfterCacheOpen(FILE_ID, {
      listFileHashes,
      cacheVersion: 12,
      hasUnsavedChanges: true,
      cachedServerSha: "local-cache-sha",
      reason: "open-cache",
    });
    expect(getDocumentSessionVersion(FILE_ID)).toBe(12);
    expect(listFileHashes).toHaveBeenCalledOnce();
  });

  it("supplementSessionVersionIfMissing fills from hash-list when session empty", async () => {
    const listFileHashes = vi
      .fn()
      .mockResolvedValue([{ id: FILE_ID, content_sha256: "abc", version: 5 }]);
    const ok = await supplementSessionVersionIfMissing(FILE_ID, {
      listFileHashes,
      hasUnsavedChanges: false,
      cachedServerSha: "abc",
      reason: "getFile-304",
    });
    expect(ok).toBe(true);
    expect(getDocumentSessionVersion(FILE_ID)).toBe(5);
  });

  it("skips supplement when draft diverged from remote sha", async () => {
    const listFileHashes = vi
      .fn()
      .mockResolvedValue([
        { id: FILE_ID, content_sha256: "remote-sha", version: 9 },
      ]);
    const ok = await supplementSessionVersionIfMissing(FILE_ID, {
      listFileHashes,
      hasUnsavedChanges: true,
      cachedServerSha: "local-cache-sha",
      reason: "save-preflight",
    });
    expect(ok).toBe(false);
    expect(getDocumentSessionVersion(FILE_ID)).toBeNull();
  });

  it("skips supplement when draft base sha is unknown", async () => {
    const listFileHashes = vi
      .fn()
      .mockResolvedValue([
        { id: FILE_ID, content_sha256: "remote-sha", version: 9 },
      ]);
    const ok = await supplementSessionVersionIfMissing(FILE_ID, {
      listFileHashes,
      hasUnsavedChanges: true,
      cachedServerSha: null,
      reason: "save-preflight",
    });
    expect(ok).toBe(false);
    expect(getDocumentSessionVersion(FILE_ID)).toBeNull();
  });

  it("ensureSessionVersionAfterCacheOpen supplements when cache meta missing", async () => {
    const listFileHashes = vi
      .fn()
      .mockResolvedValue([{ id: FILE_ID, content_sha256: "sha", version: 3 }]);
    await ensureSessionVersionAfterCacheOpen(FILE_ID, {
      listFileHashes,
      cacheVersion: null,
      hasUnsavedChanges: false,
      cachedServerSha: "sha",
      reason: "open-cache",
    });
    expect(getDocumentSessionVersion(FILE_ID)).toBe(3);
    expect(listFileHashes).toHaveBeenCalledOnce();
  });

  it("returns early when session already set", async () => {
    setDocumentSessionVersion(FILE_ID, 2, { reason: "preset" });
    const listFileHashes = vi
      .fn()
      .mockResolvedValue([{ id: FILE_ID, content_sha256: "sha", version: 99 }]);
    const ok = await supplementSessionVersionIfMissing(FILE_ID, {
      listFileHashes,
      hasUnsavedChanges: false,
      reason: "save-preflight",
    });
    expect(ok).toBe(true);
    expect(getDocumentSessionVersion(FILE_ID)).toBe(2);
    expect(listFileHashes).not.toHaveBeenCalled();
  });

  it("reconciles stale existing session from hash-list", async () => {
    setDocumentSessionVersion(FILE_ID, 2, { reason: "preset-stale" });
    const listFileHashes = vi
      .fn()
      .mockResolvedValue([
        { id: FILE_ID, content_sha256: "server-sha", version: 7 },
      ]);
    const ok = await reconcileSessionVersionFromHashList(FILE_ID, {
      listFileHashes,
      hasUnsavedChanges: false,
      cachedServerSha: "server-sha",
      reason: "getFile-304",
    });
    expect(ok).toBe(true);
    expect(getDocumentSessionVersion(FILE_ID)).toBe(7);
    expect(FileSyncState.getServerHash(FILE_ID)).toBe("server-sha");
  });

  it("does not reconcile to a remote version whose content is not applied locally", async () => {
    setDocumentSessionVersion(FILE_ID, 2, { reason: "preset-stale" });
    FileSyncState.setServerHash(FILE_ID, "old-server-sha");
    const listFileHashes = vi
      .fn()
      .mockResolvedValue([
        { id: FILE_ID, content_sha256: "new-server-sha", version: 8 },
      ]);
    const ok = await reconcileSessionVersionFromHashList(FILE_ID, {
      listFileHashes,
      hasUnsavedChanges: false,
      cachedServerSha: "old-server-sha",
      reason: "getFile-304",
    });
    expect(ok).toBe(false);
    expect(getDocumentSessionVersion(FILE_ID)).toBeNull();
    expect(FileSyncState.getServerHash(FILE_ID)).toBe("old-server-sha");
  });

  it("skips reconcile when draft base sha is unknown", async () => {
    const listFileHashes = vi
      .fn()
      .mockResolvedValue([
        { id: FILE_ID, content_sha256: "server-sha", version: 7 },
      ]);
    const ok = await reconcileSessionVersionFromHashList(FILE_ID, {
      listFileHashes,
      hasUnsavedChanges: true,
      cachedServerSha: null,
      reason: "getFile-304",
    });
    expect(ok).toBe(false);
    expect(getDocumentSessionVersion(FILE_ID)).toBeNull();
  });

  it("updates local cache server meta after save success", () => {
    FileSyncState.setLocalCache(FILE_ID, {
      elements: [],
      appState: {},
      files: {},
      deltas: [],
      meta: { serverContentSha256: "old-sha", serverVersion: 3 },
    });
    updateLocalCacheServerVersionMeta(
      FILE_ID,
      { content_sha256: "new-sha", version: 4 },
      "save-success",
    );
    expect(FileSyncState.getLocalCache(FILE_ID)?.meta).toEqual({
      serverContentSha256: "new-sha",
      serverVersion: 4,
    });
  });

  it("preserves local cache server meta when writing a local draft", () => {
    FileSyncState.setLocalCache(FILE_ID, {
      elements: [],
      appState: {},
      files: {},
      deltas: [],
      meta: { serverContentSha256: "old-sha", serverVersion: 3 },
    });

    FileSyncState.setLocalCachePreservingServerMeta(FILE_ID, {
      elements: [{ id: "local-change" }],
      appState: { name: "draft" },
      files: {},
      deltas: [],
    });

    expect(FileSyncState.getLocalCache(FILE_ID)?.meta).toEqual({
      serverContentSha256: "old-sha",
      serverVersion: 3,
    });
  });
});
