import { describe, expect, it, vi, afterEach } from "vitest";

import { apiTransport } from "./apiTransport";
import { fetchThumbnailSvgForCard } from "./fetchThumbnailSvgForCard";

describe("fetchThumbnailSvgForCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows immutable hash thumbnail requests to use cache-friendly headers", async () => {
    const requestMock = vi.spyOn(apiTransport, "request").mockResolvedValue({
      status: 200,
      headers: { "content-type": "image/svg+xml" },
      bodyText: "<svg></svg>",
    });

    await fetchThumbnailSvgForCard("/api/files/file-1/thumbnail?h=sha", {
      id8: "file-1",
    });

    expect(requestMock).toHaveBeenCalledWith({
      method: "GET",
      path: "/api/files/file-1/thumbnail?h=sha",
      headers: expect.objectContaining({
        Accept: "image/svg+xml,text/plain,*/*;q=0.8,*/*;q=0.1",
        "Cache-Control": "max-age=31536000",
      }),
    });
  });

  it("keeps non-hashed thumbnail requests uncached", async () => {
    const requestMock = vi.spyOn(apiTransport, "request").mockResolvedValue({
      status: 200,
      headers: { "content-type": "image/svg+xml" },
      bodyText: "<svg></svg>",
    });

    await fetchThumbnailSvgForCard("/api/files/file-1/thumbnail", {
      id8: "file-1",
    });

    expect(requestMock).toHaveBeenCalledWith({
      method: "GET",
      path: "/api/files/file-1/thumbnail",
      headers: expect.objectContaining({
        "Cache-Control": "no-store",
      }),
    });
  });
});
