import { chooseFileCardThumbnail, resolveValidFetchedThumb } from "./fileCardThumbnail";

describe("chooseFileCardThumbnail", () => {
  it("uses the local thumbnail first for draft files", () => {
    expect(
      chooseFileCardThumbnail({
        syncState: "draft",
        localThumb: "<svg>local</svg>",
        fetchedThumb: "<svg>server</svg>",
      }),
    ).toEqual({
      thumbSvg: "<svg>local</svg>",
      finalSource: "localThumb",
    });
  });

  it("falls back to the fetched server thumbnail for draft files without a local preview", () => {
    expect(
      chooseFileCardThumbnail({
        syncState: "draft",
        localThumb: null,
        fetchedThumb: "<svg>server</svg>",
      }),
    ).toEqual({
      thumbSvg: "<svg>server</svg>",
      finalSource: "fetchedThumb",
    });
  });

  it("uses the fetched server thumbnail first for synced files", () => {
    expect(
      chooseFileCardThumbnail({
        syncState: "synced",
        localThumb: "<svg>local</svg>",
        fetchedThumb: "<svg>server</svg>",
        fetchedThumbContentSha: "sha-1",
        fileContentSha: "sha-1",
      }),
    ).toEqual({
      thumbSvg: "<svg>server</svg>",
      finalSource: "fetchedThumb",
    });
  });

  it("ignores fetched server thumbnails whose content hash is stale", () => {
    expect(
      chooseFileCardThumbnail({
        syncState: "synced",
        localThumb: null,
        fetchedThumb: "<svg>server</svg>",
        fetchedThumbContentSha: "sha-old",
        fileContentSha: "sha-new",
      }),
    ).toEqual({
      thumbSvg: null,
      finalSource: "none",
    });
  });

  it("does not fall back to stale server thumbnails for draft Excalidraw/MindMap previews", () => {
    expect(
      chooseFileCardThumbnail({
        syncState: "draft",
        blockStaleFetchedFallback: true,
        localThumb: null,
        fetchedThumb: "<svg>server</svg>",
        fetchedThumbContentSha: "sha-1",
        fileContentSha: "sha-1",
      }),
    ).toEqual({
      thumbSvg: null,
      finalSource: "none",
    });
  });

  it("resolveValidFetchedThumb requires matching content hash when file has one", () => {
    expect(
      resolveValidFetchedThumb("<svg/>", null, "sha-1"),
    ).toBeNull();
    expect(
      resolveValidFetchedThumb("<svg/>", "sha-1", "sha-1"),
    ).toBe("<svg/>");
  });

  it("uses the fetched server thumbnail first for synced files without hash metadata", () => {
    expect(
      chooseFileCardThumbnail({
        syncState: "synced",
        localThumb: "<svg>local</svg>",
        fetchedThumb: "<svg>server</svg>",
      }),
    ).toEqual({
      thumbSvg: "<svg>server</svg>",
      finalSource: "fetchedThumb",
    });
  });

  it("prefers local thumbnail for synced browser-only drafts", () => {
    expect(
      chooseFileCardThumbnail({
        syncState: "synced",
        preferLocalThumb: true,
        localThumb: "<svg>local</svg>",
        fetchedThumb: null,
      }),
    ).toEqual({
      thumbSvg: "<svg>local</svg>",
      finalSource: "localThumb",
    });
  });

  it("does not synthesize a fallback thumbnail when no real thumbnail exists", () => {
    expect(
      chooseFileCardThumbnail({
        syncState: "synced",
        localThumb: null,
        fetchedThumb: null,
      }),
    ).toEqual({
      thumbSvg: null,
      finalSource: "none",
    });
  });
});
