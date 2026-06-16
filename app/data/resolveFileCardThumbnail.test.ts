import { afterEach, describe, expect, it, vi } from "vitest";

import { ensureLocalDraftThumbnailFromCache } from "./localDraftThumbnailRecovery";
import { LocalThumbnailCache } from "./localThumbnailCache";
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
  });

  it("prefers fetched thumb for synced server files like the file list", () => {
    LocalThumbnailCache.set("file-1", "<svg id='local'></svg>");
    const choice = chooseFileCardThumbnailForFile(
      "file-1",
      mockFile(),
      "<svg id='server'></svg>",
    );
    expect(choice.finalSource).toBe("fetchedThumb");
    expect(choice.thumbSvg).toContain("server");
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
    const overwritten = chooseFileCardThumbnailForFile(
      "file-1",
      mockFile(),
      null,
    );
    expect(overwritten.finalSource).toBe("none");
    expect(overwritten.thumbSvg).toBeNull();
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
