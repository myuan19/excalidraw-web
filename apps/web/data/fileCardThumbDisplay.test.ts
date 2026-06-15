import { afterEach, describe, expect, it } from "vitest";

import { LocalThumbnailCache } from "./localThumbnailCache";
import { resolveFileCardThumbDisplay } from "./fileCardThumbDisplay";
import { FileSyncState } from "./FileSyncState";
import {
  clearThumbnailServerMiss,
  markThumbnailServerMiss,
} from "./thumbnailServerFetchMiss";
import type { ServerFile } from "./ServerSync";

function mockFile(overrides: Partial<ServerFile> = {}): ServerFile {
  return {
    id: "file-1",
    name: "测试",
    kind: "excalidraw",
    has_thumbnail: true,
    content_sha256: "sha-1",
    folder_id: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  } as ServerFile;
}

describe("resolveFileCardThumbDisplay", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("shows temp badge for local drafts", () => {
    const display = resolveFileCardThumbDisplay(
      "local-draft:abc",
      mockFile({ id: "local-draft:abc", has_thumbnail: false }),
    );
    expect(display.badge).toBe("temp");
  });

  it("shows draft badge when sync state is draft", () => {
    FileSyncState.setDraftHash("file-1", "draft-hash");
    FileSyncState.setBaselineHash("file-1", "baseline-hash");
    const display = resolveFileCardThumbDisplay("file-1", mockFile());
    expect(display.badge).toBe("draft");
  });

  it("uses local thumb for browser drafts when cached", () => {
    LocalThumbnailCache.set("local-draft:abc", "<svg></svg>");
    const display = resolveFileCardThumbDisplay(
      "local-draft:abc",
      mockFile({ id: "local-draft:abc", has_thumbnail: false }),
    );
    expect(display.cardThumbSvg).toContain("<svg");
    expect(display.thumbLoading).toBe(false);
  });

  it("stops thumb loading after server thumbnail miss", () => {
    markThumbnailServerMiss("file-1", "sha-1");
    const display = resolveFileCardThumbDisplay("file-1", mockFile());
    expect(display.thumbLoading).toBe(false);
    clearThumbnailServerMiss("file-1");
  });
});
