import { describe, expect, it } from "vitest";

import limits from "../../../packages/common/editor-media-limits.cjs";
import { applyMindMapMediaLimitsToConfig } from "./mindMapMediaLimits";

describe("applyMindMapMediaLimitsToConfig", () => {
  it("injects caps from editor-media-limits.cjs", () => {
    const config = applyMindMapMediaLimitsToConfig({ enableFreeDrag: true });
    expect(config.maxNodeImageStorageBytes).toBe(limits.maxFileBytes);
    expect(config.maxNodeImageStorageWidth).toBe(limits.maxDimension);
    expect(config.maxNodeImageStorageHeight).toBe(limits.maxDimension);
  });
});
