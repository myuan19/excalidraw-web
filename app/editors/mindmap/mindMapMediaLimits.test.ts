import { describe, expect, it } from "vitest";

import { EDITOR_MEDIA_LIMITS } from "@excalidraw/common";

import { applyMindMapMediaLimitsToConfig } from "./mindMapMediaLimits";

describe("applyMindMapMediaLimitsToConfig", () => {
  it("injects caps from EDITOR_MEDIA_LIMITS", () => {
    const config = applyMindMapMediaLimitsToConfig({ enableFreeDrag: true });
    expect(config.maxNodeImageStorageBytes).toBe(
      EDITOR_MEDIA_LIMITS.maxFileBytes,
    );
    expect(config.maxNodeImageStorageWidth).toBe(EDITOR_MEDIA_LIMITS.maxDimension);
    expect(config.maxNodeImageStorageHeight).toBe(
      EDITOR_MEDIA_LIMITS.maxDimension,
    );
  });
});
