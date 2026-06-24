import { describe, expect, it } from "vitest";

import { parseMindMapSaveProgress } from "./mindMapBridgeProtocol";

describe("parseMindMapSaveProgress", () => {
  it("parses native save progress payloads", () => {
    expect(
      parseMindMapSaveProgress({
        requestId: "req-1",
        phase: "thumbnail",
        elapsedMs: 1200,
        waitReason: "export-thumbnail-force-load",
      }),
    ).toEqual({
      requestId: "req-1",
      phase: "thumbnail",
      elapsedMs: 1200,
      waitReason: "export-thumbnail-force-load",
      message: null,
      snapshotMs: null,
      thumbnailMs: null,
      hasThumbnail: undefined,
    });
  });

  it("returns null for invalid payloads", () => {
    expect(parseMindMapSaveProgress(null)).toBeNull();
    expect(parseMindMapSaveProgress({ requestId: "req-1" })).toBeNull();
  });
});
