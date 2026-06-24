import { beforeEach, describe, expect, it, vi } from "vitest";

import { ServerSync } from "./ServerSync";
import { scheduleSavedFileThumbnailUpload } from "./fileThumbnailPersistence";
import { LocalThumbnailCache } from "./localThumbnailCache";
import {
  clearPendingSavedFileThumbnail,
  getPendingSavedFileThumbnailContentSha,
  markPendingSavedFileThumbnail,
} from "./sessionFileThumbnail";

const FILE_ID = "mindmap-thumbnail-file";
const THUMBNAIL =
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>';

describe("fileThumbnailPersistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    clearPendingSavedFileThumbnail(FILE_ID);
    vi.restoreAllMocks();
  });

  it("marks saved content as pending while thumbnail generation is deferred", () => {
    scheduleSavedFileThumbnailUpload({
      fileId: FILE_ID,
      kind: "mindmap",
      name: "Map",
      contentSha: "server-sha",
      version: 2,
      thumbnail: null,
      source: "home",
    });

    expect(getPendingSavedFileThumbnailContentSha(FILE_ID)).toBe("server-sha");
  });

  it("uploads a matching draft thumbnail when it arrived before the server save completed", async () => {
    const saveThumbnail = vi
      .spyOn(ServerSync, "saveFileThumbnail")
      .mockResolvedValue({
        ok: true,
        content_sha256: "server-sha",
        version: 2,
      });
    LocalThumbnailCache.setDraftPreview(FILE_ID, THUMBNAIL, "document-hash");

    scheduleSavedFileThumbnailUpload({
      fileId: FILE_ID,
      kind: "mindmap",
      name: "Map",
      contentSha: "server-sha",
      version: 2,
      thumbnail: null,
      documentHash: "document-hash",
      source: "home",
    });

    await vi.waitFor(() => expect(saveThumbnail).toHaveBeenCalledTimes(1));
    expect(saveThumbnail).toHaveBeenCalledWith(FILE_ID, THUMBNAIL, {
      contentSha256: "server-sha",
      source: "home-thumbnail",
    });
  });

  it("does not bind a stale local thumbnail when no draft hash matches", () => {
    LocalThumbnailCache.setDraftPreview(FILE_ID, THUMBNAIL, "old-document-hash");

    scheduleSavedFileThumbnailUpload({
      fileId: FILE_ID,
      kind: "mindmap",
      name: "Map",
      contentSha: "server-sha",
      version: 2,
      thumbnail: null,
      documentHash: "new-document-hash",
      source: "home",
    });

    expect(LocalThumbnailCache.getForContent(FILE_ID, "server-sha")).toBeNull();
    expect(getPendingSavedFileThumbnailContentSha(FILE_ID)).toBe("server-sha");
  });

  it("queues a full thumbnail upload for saved content", async () => {
    const saveThumbnail = vi
      .spyOn(ServerSync, "saveFileThumbnail")
      .mockResolvedValue({
        ok: true,
        content_sha256: "server-sha",
        version: 2,
      });

    scheduleSavedFileThumbnailUpload({
      fileId: FILE_ID,
      kind: "mindmap",
      name: "Map",
      contentSha: "server-sha",
      version: 2,
      thumbnail: THUMBNAIL,
      source: "home",
    });

    await vi.waitFor(() => expect(saveThumbnail).toHaveBeenCalledTimes(1));
    expect(saveThumbnail).toHaveBeenCalledWith(FILE_ID, THUMBNAIL, {
      contentSha256: "server-sha",
      source: "home-thumbnail",
    });
  });

  it("drops generated thumbnails for an older save when a newer one is pending", () => {
    const saveThumbnail = vi.spyOn(ServerSync, "saveFileThumbnail");
    markPendingSavedFileThumbnail(FILE_ID, "newer-sha");

    scheduleSavedFileThumbnailUpload({
      fileId: FILE_ID,
      kind: "mindmap",
      name: "Map",
      contentSha: "older-sha",
      thumbnail: THUMBNAIL,
      source: "home",
    });

    expect(saveThumbnail).not.toHaveBeenCalled();
    expect(getPendingSavedFileThumbnailContentSha(FILE_ID)).toBe("newer-sha");
  });

  it("does not queue a duplicate upload for the same saved thumbnail", () => {
    const saveThumbnail = vi
      .spyOn(ServerSync, "saveFileThumbnail")
      .mockResolvedValue({
        ok: true,
        content_sha256: "server-sha",
      });

    scheduleSavedFileThumbnailUpload({
      fileId: FILE_ID,
      kind: "mindmap",
      name: "Map",
      contentSha: "server-sha",
      thumbnail: THUMBNAIL,
      source: "thumbnail",
    });
    scheduleSavedFileThumbnailUpload({
      fileId: FILE_ID,
      kind: "mindmap",
      name: "Map",
      contentSha: "server-sha",
      thumbnail: THUMBNAIL,
      source: "thumbnail",
    });

    expect(saveThumbnail).toHaveBeenCalledTimes(1);
  });
});
