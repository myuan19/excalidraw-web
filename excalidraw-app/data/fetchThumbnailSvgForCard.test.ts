import { describe, expect, it, vi, afterEach } from "vitest";

import { fetchThumbnailSvgForCard } from "./fetchThumbnailSvgForCard";

describe("fetchThumbnailSvgForCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows immutable hash thumbnail requests to use the browser cache", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "image/svg+xml" }),
      text: async () => "<svg></svg>",
    }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchThumbnailSvgForCard("/api/files/file-1/thumbnail?h=sha", {
      id8: "file-1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/files/file-1/thumbnail?h=sha",
      expect.objectContaining({ cache: "force-cache" }),
    );
  });

  it("keeps non-hashed thumbnail requests uncached", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "image/svg+xml" }),
      text: async () => "<svg></svg>",
    }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchThumbnailSvgForCard("/api/files/file-1/thumbnail", {
      id8: "file-1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/files/file-1/thumbnail",
      expect.objectContaining({ cache: "no-store" }),
    );
  });
});
