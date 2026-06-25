import { afterEach, describe, expect, it, vi } from "vitest";

import { ensureLocalDraftThumbnailFromCache } from "./localDraftThumbnailRecovery";
import { LocalThumbnailCache } from "./localThumbnailCache";
import { FileSyncState } from "./FileSyncState";
import {
  clearNativeThumbnailPending,
  markNativeThumbnailPending,
} from "./nativeThumbnailPending";
import {
  chooseFileCardThumbnailForFile,
  fileCardThumbnailCanPreview,
  resolveFileCardThumbnailSvg,
} from "./resolveFileCardThumbnail";
import type { ServerFile } from "./ServerSync";

vi.mock("./localDraftThumbnailRecovery", () => ({
  ensureLocalDraftThumbnailFromCache: vi.fn(),
}));

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

describe("resolveFileCardThumbnail", () => {
  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearNativeThumbnailPending(["file-1", "file-2", "local-draft:abc", "local-draft:xyz", "local-draft:mindmap-1"]);
  });

  it("keeps fetched thumbs while native generation is pending", () => {
    markNativeThumbnailPending(["file-1"]);
    const choice = chooseFileCardThumbnailForFile(
      "file-1",
      mockFile(),
      "<svg id='server'></svg>",
      "sha-1",
    );
    expect(choice.finalSource).toBe("fetchedThumb");
    expect(choice.thumbSvg).toContain("server");
  });

  it("uses warm excalidraw session thumbnail before content hash binds", () => {
    LocalThumbnailCache.set(
      "file-1",
      '<svg data-excal-filelist-thumb="1"><path d="M0 0 L10 10"/></svg>',
    );
    const choice = chooseFileCardThumbnailForFile(
      "file-1",
      mockFile({ content_sha256: null }),
      null,
    );
    expect(choice.finalSource).toBe("localThumb");
    expect(choice.thumbSvg).toContain("filelist-thumb");
  });

  it("uses warm local thumb for synced server files only when content hash matches", () => {
    LocalThumbnailCache.set("file-1", "<svg id='local'></svg>", {
      contentSha: "sha-1",
    });
    const matching = chooseFileCardThumbnailForFile("file-1", mockFile(), null);
    expect(matching.finalSource).toBe("localThumb");
    expect(matching.thumbSvg).toContain("local");

    const stale = chooseFileCardThumbnailForFile(
      "file-1",
      mockFile({ content_sha256: "sha-2" }),
      null,
    );
    expect(stale.finalSource).toBe("none");
    expect(stale.thumbSvg).toBeNull();

    LocalThumbnailCache.set("file-1", "<svg id='draft'></svg>");
    const withUnboundDraftOnly = chooseFileCardThumbnailForFile(
      "file-1",
      mockFile({ content_sha256: "sha-2" }),
      null,
    );
    expect(withUnboundDraftOnly.finalSource).toBe("none");
    expect(withUnboundDraftOnly.thumbSvg).toBeNull();

    LocalThumbnailCache.set("file-1", "<svg id='local'></svg>", {
      contentSha: "sha-1",
    });
    LocalThumbnailCache.set("file-1", "<svg id='draft'></svg>");
    const savedSurvivesDraftWrite = chooseFileCardThumbnailForFile(
      "file-1",
      mockFile(),
      null,
    );
    expect(savedSurvivesDraftWrite.finalSource).toBe("localThumb");
    expect(savedSurvivesDraftWrite.thumbSvg).toContain("local");
  });

  it("falls back to stale fetched thumbs for draft files awaiting a matching session preview", () => {
    FileSyncState.setBaselineHash("file-1", "sha-1");
    FileSyncState.setDraftHash("file-1", "draft-2");
    LocalThumbnailCache.setDraftPreview(
      "file-1",
      "<svg id='draft-old'></svg>",
      "draft-1",
    );

    const choice = chooseFileCardThumbnailForFile(
      "file-1",
      mockFile(),
      "<svg id='server'></svg>",
      "sha-old",
    );

    expect(choice.finalSource).toBe("fetchedThumb");
    expect(choice.thumbSvg).toContain("server");
  });

  it("prefers local thumb for browser drafts like the file list", () => {
    LocalThumbnailCache.set("local-draft:abc", "<svg id='draft'></svg>");
    const choice = chooseFileCardThumbnailForFile(
      "local-draft:abc",
      mockFile({ id: "local-draft:abc", has_thumbnail: false }),
      "<svg id='server'></svg>",
    );
    expect(choice.finalSource).toBe("localThumb");
    expect(choice.thumbSvg).toContain("draft");
  });

  it("can preview when server has_thumbnail even before fetch", () => {
    expect(
      fileCardThumbnailCanPreview("file-2", mockFile({ id: "file-2" }), null),
    ).toBe(true);
  });

  it("cannot preview local draft without session thumb", () => {
    expect(
      fileCardThumbnailCanPreview(
        "local-draft:xyz",
        mockFile({ id: "local-draft:xyz", has_thumbnail: false }),
        null,
      ),
    ).toBe(false);
  });

  it("recovers local draft thumbnail from persisted mindmap cache", async () => {
    const id = "local-draft:mindmap-1";
    vi.mocked(ensureLocalDraftThumbnailFromCache).mockImplementationOnce(
      async (fileId: string) => {
        const thumb =
          '<svg width="120" height="80" viewBox="0 0 120 80"><circle cx="60" cy="40" r="20" fill="#111"/></svg>';
        LocalThumbnailCache.set(fileId, thumb);
        return thumb;
      },
    );

    expect(LocalThumbnailCache.get(id)).toBeNull();
    const svg = await resolveFileCardThumbnailSvg(
      id,
      mockFile({ id, kind: "mindmap", has_thumbnail: false }),
    );

    expect(svg).toContain("<svg");
    expect(LocalThumbnailCache.get(id)).toContain("<svg");
  });
});
