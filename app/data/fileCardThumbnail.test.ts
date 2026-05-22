import { chooseFileCardThumbnail } from "./fileCardThumbnail";

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
      }),
    ).toEqual({
      thumbSvg: "<svg>server</svg>",
      finalSource: "fetchedThumb",
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
