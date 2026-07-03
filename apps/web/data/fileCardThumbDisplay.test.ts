import { afterEach, describe, expect, it } from "vitest";

import { LocalThumbnailCache } from "./localThumbnailCache";
import {
  clearThumbnailSavePending,
  markThumbnailSavePending,
} from "./thumbnailSavePending";
import { resolveFileCardThumbDisplay } from "./fileCardThumbDisplay";
import { markEditSessionEdited, markEditSessionOpened } from "./editSessionService";
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
    FileSyncState.clearHashStateForFile("file-1");
    FileSyncState.clearHashStateForFile("file-corrupt");
    FileSyncState.clearHashStateForFile("local-draft:abc");
    clearThumbnailSavePending(["file-1", "file-corrupt", "local-draft:abc"]);
  });

  it("shows corrupt badge and skips thumbnail loading", () => {
    const display = resolveFileCardThumbDisplay(
      "file-corrupt",
      mockFile({
        id: "file-corrupt",
        health: "corrupt",
        corrupt: true,
        has_thumbnail: true,
        parse_error: "invalid_json",
      }),
    );
    expect(display.badge).toBe("corrupt");
    expect(display.cardThumbSvg).toBeNull();
    expect(display.thumbLoading).toBe(false);
  });

  it("shows temporary badge for browser-local drafts", () => {
    const display = resolveFileCardThumbDisplay(
      "local-draft:abc",
      mockFile({ id: "local-draft:abc", has_thumbnail: false }),
    );
    expect(display.badge).toBe("temporary");
  });

  it("shows draft badge when sync state is draft", () => {
    FileSyncState.setDraftHash("file-1", "draft-hash");
    FileSyncState.setBaselineHash("file-1", "baseline-hash");
    const display = resolveFileCardThumbDisplay("file-1", mockFile(), null, null, {
      showFetchLoading: true,
    });
    expect(display.badge).toBe("draft");
  });

  it("prefers draft badge over interrupted session while sync state is draft", () => {
    FileSyncState.setDraftHash("file-1", "draft-hash");
    FileSyncState.setBaselineHash("file-1", "baseline-hash");
    markEditSessionOpened("file-1");
    markEditSessionEdited("file-1");
    const display = resolveFileCardThumbDisplay("file-1", mockFile());
    expect(display.badge).toBe("draft");
  });

  it("uses local thumb for browser drafts when cached", () => {
    LocalThumbnailCache.set(
      "local-draft:abc",
      '<svg><path d="M0 0 L10 10"/></svg>',
    );
    const display = resolveFileCardThumbDisplay(
      "local-draft:abc",
      mockFile({ id: "local-draft:abc", has_thumbnail: false }),
    );
    expect(display.cardThumbSvg).toContain("<svg");
    expect(display.thumbLoading).toBe(false);
  });

  it("prefers content-matched local thumbnails over stale fetched thumbnails", () => {
    LocalThumbnailCache.set(
      "file-1",
      '<svg><path data-thumb="local" d="M0 0 L10 10"/></svg>',
      { contentSha: "sha-1" },
    );

    const display = resolveFileCardThumbDisplay(
      "file-1",
      mockFile(),
      '<svg><path data-thumb="fetched" d="M0 0 L1 1"/></svg>',
      "sha-1",
    );

    expect(display.cardThumbSvg).toContain('data-thumb="local"');
    expect(display.cardThumbSvg).not.toContain('data-thumb="fetched"');
  });

  it("displays fetched thumbnails only when their content hash matches", () => {
    markThumbnailServerMiss("file-1", "sha-1");
    const display = resolveFileCardThumbDisplay("file-1", mockFile());
    expect(display.thumbLoading).toBe(false);
    clearThumbnailServerMiss("file-1");
  });

  it("does not trust fetched thumbnails without a matching content hash", () => {
    const display = resolveFileCardThumbDisplay(
      "file-1",
      mockFile({ has_thumbnail: true, content_sha256: "sha-new" }),
      '<svg><path data-thumb="old" d="M0 0 L10 10"/></svg>',
      null,
      { showFetchLoading: true },
    );

    expect(display.cardThumbSvg).toBeNull();
    expect(display.thumbLoading).toBe(true);
  });

  it("shows light blue save loading while thumbnail save is pending", () => {
    markThumbnailSavePending(["file-1"]);
    const fetched =
      '<svg><path data-thumb="saved" d="M0 0 L10 10"/></svg>';
    const display = resolveFileCardThumbDisplay(
      "file-1",
      mockFile({ kind: "excalidraw", has_thumbnail: true }),
      fetched,
      "sha-1",
    );
    expect(display.cardThumbSvg).toContain("data-thumb=\"saved\"");
    expect(display.thumbLoading).toBe(false);
    expect(display.thumbSwitchLoading).toBe(true);
    expect(display.thumbBlank).toBe(false);
    expect(display.badge).toBeNull();
  });

  it("shows the current draft preview while unsaved instead of the last saved thumb", () => {
    FileSyncState.setDraftHash("file-1", "draft-hash");
    FileSyncState.setBaselineHash("file-1", "baseline-hash");
    LocalThumbnailCache.bindToContentSha(
      "file-1",
      "sha-1",
      '<svg><path data-thumb="saved" d="M0 0 L10 10"/></svg>',
    );
    LocalThumbnailCache.setDraftPreview(
      "file-1",
      '<svg data-excal-thumb-source="mindmap-native"><text>New</text></svg>',
      "draft-hash",
    );

    const display = resolveFileCardThumbDisplay("file-1", mockFile());

    // 未保存窗口内展示「上一次修改」的草稿预览；saved 槽仅在预览缺失时兜底。
    expect(display.cardThumbSvg).toContain("mindmap-native");
    expect(display.badge).toBe("draft");
  });

  it("falls back to the last saved thumb while unsaved when no draft preview exists", () => {
    FileSyncState.setDraftHash("file-1", "draft-hash");
    FileSyncState.setBaselineHash("file-1", "baseline-hash");
    LocalThumbnailCache.bindToContentSha(
      "file-1",
      "sha-1",
      '<svg><path data-thumb="saved" d="M0 0 L10 10"/></svg>',
    );

    const display = resolveFileCardThumbDisplay("file-1", mockFile());

    expect(display.cardThumbSvg).toContain('data-thumb="saved"');
    expect(display.badge).toBe("draft");
  });

  it("shows stale schematic MindMap thumbnails for unsaved files on the home list", () => {
    FileSyncState.setDraftHash("file-1", "draft-hash");
    FileSyncState.setBaselineHash("file-1", "baseline-hash");
    const schematic =
      '<svg data-excal-thumb-source="mindmap-schematic"><text>Old</text></svg>';
    const display = resolveFileCardThumbDisplay(
      "file-1",
      mockFile({ kind: "mindmap", has_thumbnail: true }),
      schematic,
      "sha-old",
    );
    expect(display.cardThumbSvg).toContain("mindmap-schematic");
    expect(display.thumbLoading).toBe(false);
    expect(display.thumbSwitchLoading).toBe(false);
  });

  it("does not show fetch loading unless showFetchLoading is true", () => {
    const display = resolveFileCardThumbDisplay(
      "file-1",
      mockFile({ has_thumbnail: true }),
      null,
      null,
      { showFetchLoading: false },
    );
    expect(display.thumbLoading).toBe(false);
    expect(display.cardThumbSvg).toBeNull();
  });

  it("falls back to placeholder when native generation is not pending", () => {
    const display = resolveFileCardThumbDisplay(
      "file-1",
      mockFile({ has_thumbnail: false }),
    );
    expect(display.cardThumbSvg).toBeNull();
    expect(display.thumbBlank).toBe(false);
    expect(display.thumbLoading).toBe(false);
  });

  it("does not reuse stale unbound session thumbnails for hashed files", () => {
    LocalThumbnailCache.set(
      "file-1",
      '<svg data-excal-filelist-thumb="1"><path d="M0 0 L10 10"/></svg>',
    );
    const display = resolveFileCardThumbDisplay("file-1", mockFile(), null, null, {
      showFetchLoading: true,
    });
    expect(display.cardThumbSvg).toBeNull();
    expect(display.thumbBlank).toBe(false);
  });
});
