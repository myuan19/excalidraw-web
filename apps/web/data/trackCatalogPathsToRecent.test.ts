import { describe, expect, it } from "vitest";

import { fileAwaitingNativeThumbnail } from "./trackCatalogPathsToRecent";

import type { ServerFile } from "./ServerSync";

describe("fileAwaitingNativeThumbnail", () => {
  it("detects editor files that have no content-bound local thumbnail", () => {
    const file = {
      id: "file-1",
      kind: "mindmap",
      content_sha256: "sha-1",
    } as ServerFile;

    expect(fileAwaitingNativeThumbnail(file)).toBe(true);
  });
});
