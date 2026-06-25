import { describe, expect, it } from "vitest";

import { buildServerThumbnailRequestPath } from "./serverThumbnailUrl";

describe("serverThumbnailUrl", () => {
  it("builds stable thumbnail URLs with hash and updated_at", () => {
    expect(
      buildServerThumbnailRequestPath("file-1", {
        content_sha256: "sha",
        updated_at: "2026-06-25T02:59:08.759Z",
      }),
    ).toBe(
      "/api/files/file-1/thumbnail?h=sha&u=2026-06-25T02%3A59%3A08.759Z",
    );
  });

  it("omits query when content hash is missing", () => {
    expect(buildServerThumbnailRequestPath("file-1", {})).toBe(
      "/api/files/file-1/thumbnail",
    );
  });
});
