import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearAllThumbnailServerMisses,
  clearThumbnailServerMiss,
  isThumbnailServerMiss,
  markThumbnailServerMiss,
  pruneThumbnailServerMisses,
  shouldFetchServerThumbnail,
} from "./thumbnailServerFetchMiss";

describe("thumbnailServerFetchMiss", () => {
  afterEach(() => {
    clearThumbnailServerMiss("file-a");
    clearThumbnailServerMiss("file-b");
    sessionStorage.clear();
  });

  it("marks and detects miss for the same content hash", () => {
    expect(markThumbnailServerMiss("file-a", "sha-1")).toBe(true);
    expect(isThumbnailServerMiss("file-a", "sha-1")).toBe(true);
    expect(markThumbnailServerMiss("file-a", "sha-1")).toBe(false);
  });

  it("allows refetch after content hash changes", () => {
    markThumbnailServerMiss("file-a", "sha-1");
    expect(isThumbnailServerMiss("file-a", "sha-2")).toBe(false);
    expect(shouldFetchServerThumbnail("file-a", {
      has_thumbnail: true,
      content_sha256: "sha-2",
    })).toBe(true);
  });

  it("prunes stale file ids and outdated hashes", () => {
    markThumbnailServerMiss("file-a", "sha-1");
    markThumbnailServerMiss("file-b", "sha-b");
    pruneThumbnailServerMisses({ "file-a": "sha-2" });
    expect(isThumbnailServerMiss("file-a", "sha-1")).toBe(false);
    expect(isThumbnailServerMiss("file-b", "sha-b")).toBe(false);
  });

  it("clears all registered thumbnail misses", () => {
    markThumbnailServerMiss("file-a", "sha-1");
    markThumbnailServerMiss("file-b", "sha-b");
    clearAllThumbnailServerMisses();
    expect(isThumbnailServerMiss("file-a", "sha-1")).toBe(false);
    expect(isThumbnailServerMiss("file-b", "sha-b")).toBe(false);
  });

  it("keeps misses across module reloads in the same session", async () => {
    markThumbnailServerMiss("file-a", "sha-1");
    vi.resetModules();

    const freshModule = await import("./thumbnailServerFetchMiss");

    expect(freshModule.isThumbnailServerMiss("file-a", "sha-1")).toBe(true);
    expect(freshModule.shouldFetchServerThumbnail("file-a", {
      has_thumbnail: true,
      content_sha256: "sha-1",
    })).toBe(false);
  });
});
