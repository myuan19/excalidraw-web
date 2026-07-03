import { describe, expect, it } from "vitest";

import {
  chooseFileCardThumbnail,
  resolveFileListCardLocalThumbPolicy,
  resolveListCardLocalThumb,
  resolveValidFetchedThumb,
} from "./fileCardThumbnail";
import { LocalThumbnailCache } from "./localThumbnailCache";
import { isNativeMindMapThumbnailSvg } from "./thumbnailSvg";

describe("resolveFileListCardLocalThumbPolicy", () => {
  it("maps browser drafts to live preview policy", () => {
    expect(
      resolveFileListCardLocalThumbPolicy("local-draft:abc", "draft"),
    ).toBe("live-draft-preview");
  });

  it("maps unsaved server files to draft-preview-first policy", () => {
    expect(resolveFileListCardLocalThumbPolicy("file-1", "draft")).toBe(
      "draft-preview-until-sync",
    );
  });

  it("maps synced server files to synced-session policy", () => {
    expect(resolveFileListCardLocalThumbPolicy("file-1", "synced")).toBe(
      "synced-session",
    );
  });
});

describe("resolveListCardLocalThumb", () => {
  it("prefers current draft preview for draft-preview-until-sync", () => {
    const saved = '<svg><path data-thumb="saved" d="M0 0 L10 10"/></svg>';
    const draft = '<svg><path data-thumb="draft" d="M0 0 L10 10"/></svg>';
    LocalThumbnailCache.bindToContentSha("file-1", "sha-1", saved);
    LocalThumbnailCache.setDraftPreview("file-1", draft, "draft-hash");

    expect(
      resolveListCardLocalThumb({
        fileId: "file-1",
        policy: "draft-preview-until-sync",
        draftHash: "draft-hash",
        contentSha: "sha-1",
      }),
    ).toContain('data-thumb="draft"');
  });

  it("falls back to latest draft export when draft hash lags behind", () => {
    const saved = '<svg><path data-thumb="saved" d="M0 0 L10 10"/></svg>';
    const draft = '<svg><path data-thumb="draft" d="M0 0 L10 10"/></svg>';
    LocalThumbnailCache.bindToContentSha("file-2", "sha-1", saved);
    LocalThumbnailCache.setDraftPreview("file-2", draft, "hash-older");

    expect(
      resolveListCardLocalThumb({
        fileId: "file-2",
        policy: "draft-preview-until-sync",
        draftHash: "hash-newer",
        contentSha: "sha-1",
      }),
    ).toContain('data-thumb="draft"');
  });

  it("falls back to saved slot when no draft preview exists", () => {
    const saved = '<svg><path data-thumb="saved" d="M0 0 L10 10"/></svg>';
    LocalThumbnailCache.bindToContentSha("file-3", "sha-1", saved);

    expect(
      resolveListCardLocalThumb({
        fileId: "file-3",
        policy: "draft-preview-until-sync",
        draftHash: "any-hash",
        contentSha: "sha-1",
      }),
    ).toContain('data-thumb="saved"');
  });
});

describe("chooseFileCardThumbnail", () => {
  it("prefers warm native local thumb over stale fetched schematic for synced server files", () => {
    const native =
      '<svg data-excal-thumb-source="mindmap-native"><g transform="matrix(1,0,0,1,0,0)"></g></svg>';
    const schematic =
      '<svg data-excal-thumb-source="mindmap-schematic"><text>示意</text></svg>';
    const choice = chooseFileCardThumbnail({
      syncState: "synced",
      listLocalPolicy: "synced-session",
      preferLocalThumb: false,
      localThumb: native,
      fetchedThumb: schematic,
    });
    expect(choice.thumbSvg).toBe(native);
    expect(choice.finalSource).toBe("localThumb");
  });

  it("blocks stale fetched fallback while live draft preview is pending", () => {
    const choice = chooseFileCardThumbnail({
      syncState: "draft",
      listLocalPolicy: "live-draft-preview",
      preferLocalThumb: true,
      localThumb: null,
      fetchedThumb: '<svg data-thumb="server"></svg>',
    });

    expect(choice.thumbSvg).toBeNull();
    expect(choice.finalSource).toBe("none");
  });

  it("allows stale fetched fallback for unsaved server files when local slots are empty", () => {
    const choice = chooseFileCardThumbnail({
      syncState: "draft",
      listLocalPolicy: "draft-preview-until-sync",
      preferLocalThumb: true,
      localThumb: null,
      fetchedThumb: '<svg data-thumb="server"></svg>',
      fetchedThumbContentSha: "sha-old",
      fileContentSha: "sha-new",
    });

    expect(choice.thumbSvg).toContain('data-thumb="server"');
    expect(choice.finalSource).toBe("fetchedThumb");
  });

  it("only accepts fetched thumbnails that match the file content hash", () => {
    const svg = '<svg data-thumb="server"></svg>';

    expect(resolveValidFetchedThumb(svg, "sha-1", "sha-1")).toBe(svg);
    expect(resolveValidFetchedThumb(svg, "sha-old", "sha-1")).toBeNull();
    expect(resolveValidFetchedThumb(svg, null, "sha-1")).toBeNull();
  });
});

describe("isNativeMindMapThumbnailSvg", () => {
  it("detects only native mindmap thumbnail markers", () => {
    expect(
      isNativeMindMapThumbnailSvg(
        '<svg data-excal-thumb-source="mindmap-native"></svg>',
      ),
    ).toBe(true);
    expect(
      isNativeMindMapThumbnailSvg(
        '<svg data-excal-thumb-source="mindmap-schematic"></svg>',
      ),
    ).toBe(false);
    expect(
      isNativeMindMapThumbnailSvg(
        '<svg data-excal-mindmap-thumb-source="native"></svg>',
      ),
    ).toBe(true);
    expect(
      isNativeMindMapThumbnailSvg(
        '<svg data-excal-mindmap-thumb-source="schematic"></svg>',
      ),
    ).toBe(false);
  });
});
