import { describe, expect, it } from "vitest";

import { computeMindMapNodeVisualScale } from "./mindMapFocusedViewBox.js";

describe("computeMindMapNodeVisualScale", () => {
  const base = {
    baselineNodeCount: 10,
    minVisualScaleNodeCount: 40,
    singleNodeVisualScale: 1.2,
    minNodeVisualScale: 0.8,
  };

  it("halves node-count deviation when influence is 0.5", () => {
    const full = computeMindMapNodeVisualScale(40, {
      ...base,
      nodeCountScaleInfluence: 1,
    });
    const half = computeMindMapNodeVisualScale(40, {
      ...base,
      nodeCountScaleInfluence: 0.5,
    });
    expect(half).toBeCloseTo(1 + (full - 1) * 0.5, 5);
  });
});
