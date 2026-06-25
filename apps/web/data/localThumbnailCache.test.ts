import { beforeEach, describe, expect, it } from "vitest";

import { LocalThumbnailCache } from "./localThumbnailCache";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

describe("LocalThumbnailCache", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("only returns draft previews when the bound draft hash matches", () => {
    LocalThumbnailCache.setDraftPreview("file-1", SVG, "draft-a");

    expect(LocalThumbnailCache.getForDraft("file-1", "draft-a")).toBe(SVG);
    expect(LocalThumbnailCache.getForDraft("file-1", "draft-b")).toBeNull();
    expect(LocalThumbnailCache.getForContent("file-1", "draft-a")).toBeNull();
  });

  it("binds saved thumbnails to server content hashes", () => {
    LocalThumbnailCache.setDraftPreview("file-1", SVG, "draft-a");

    expect(
      LocalThumbnailCache.bindToContentSha("file-1", "server-sha"),
    ).toBe(SVG);
    expect(LocalThumbnailCache.getForContent("file-1", "server-sha")).toBe(
      SVG,
    );
    // 双槽：saved 绑定后 draft 槽仍保留同 hash 的预览
    expect(LocalThumbnailCache.getForDraft("file-1", "draft-a")).toBe(SVG);
  });

  it("keeps content hash binding when a draft preview is written", () => {
    LocalThumbnailCache.bindToContentSha("file-1", "server-sha", SVG);
    LocalThumbnailCache.setDraftPreview(
      "file-1",
      '<svg data-thumb="draft"></svg>',
      "draft-b",
    );

    expect(LocalThumbnailCache.getForContent("file-1", "server-sha")).toBe(SVG);
    expect(LocalThumbnailCache.getForDraft("file-1", "draft-b")).toContain(
      "data-thumb=\"draft\"",
    );
    expect(LocalThumbnailCache.getDraftSvg("file-1")).toContain(
      "data-thumb=\"draft\"",
    );
  });
});
