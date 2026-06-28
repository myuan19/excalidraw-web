import { afterEach, describe, expect, it, vi } from "vitest";

import { FileSyncState } from "./FileSyncState";
import { MindMapAdapter } from "./formats/registry";
import { LocalThumbnailCache } from "./localThumbnailCache";
import { persistNativeMindMapThumbnail } from "./mindMapThumbnail";
import { ServerSync } from "./ServerSync";
import { hashDocumentSnapshot } from "./sceneHash";

vi.mock("./ServerSync", () => ({
  ServerSync: {
    saveFileImmediate: vi.fn(async () => ({
      ok: true,
      content_sha256: "server-sha",
    })),
    saveThumbnailOnly: vi.fn(async () => ({
      ok: true,
      content_sha256: "server-thumb-sha",
      version: 2,
      updated_at: "2026-06-22T00:00:00.000Z",
    })),
  },
}));

describe("persistNativeMindMapThumbnail", () => {
  const fileId = "mindmap-thumbnail-file";
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(ServerSync.saveFileImmediate).mockClear();
    vi.mocked(ServerSync.saveThumbnailOnly).mockClear();
  });

  it("saves only the thumbnail when the document is clean", async () => {
    const document = MindMapAdapter.toDocument(MindMapAdapter.createEmpty("Map"));
    const visibleSvg =
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L10 10"/></svg>';
    FileSyncState.alignHashes(fileId, hashDocumentSnapshot(document));

    await persistNativeMindMapThumbnail(fileId, visibleSvg, document, "Map");

    expect(ServerSync.saveFileImmediate).not.toHaveBeenCalled();
    expect(ServerSync.saveThumbnailOnly).toHaveBeenCalledWith(
      fileId,
      expect.stringContaining("<svg"),
    );
    expect(
      LocalThumbnailCache.getForContent(fileId, "server-thumb-sha"),
    ).toContain("<svg");
  });

  it("does not persist server thumbnails while local content is dirty", async () => {
    const document = MindMapAdapter.toDocument(MindMapAdapter.createEmpty("Map"));
    FileSyncState.setBaselineHash(fileId, "baseline");
    FileSyncState.setDraftHash(fileId, "draft");

    await persistNativeMindMapThumbnail(fileId, svg, document, "Map");

    expect(ServerSync.saveFileImmediate).not.toHaveBeenCalled();
    expect(ServerSync.saveThumbnailOnly).not.toHaveBeenCalled();
  });
});
