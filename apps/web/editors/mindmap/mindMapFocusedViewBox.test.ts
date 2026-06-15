import { describe, expect, it } from "vitest";

import {
  buildMindMapCanvasFocusedViewBoxOptions,
  buildMindMapThumbnailFocusedViewBoxOptions,
  computeMindMapFocusedViewBoxFromNodeBounds,
  computeMindMapNodeVisualScale,
  filterMindMapFocusedNodeBounds,
  getMindMapEditorFocusedTargetRootScreenRatio,
  getMindMapThumbnailTargetRootScreenRatio,
} from "./mindMapFocusedViewBox.js";

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

  it("halves visual scale only for a lone root node", () => {
    const multi = computeMindMapNodeVisualScale(3, {
      ...base,
      nodeCountScaleInfluence: 0.5,
      singleRootOnlyVisualScaleFactor: 0.5,
    });
    const withoutRootFactor = computeMindMapNodeVisualScale(3, {
      ...base,
      nodeCountScaleInfluence: 0.5,
      singleRootOnlyVisualScaleFactor: 1,
    });
    expect(multi).toBeCloseTo(withoutRootFactor, 5);

    const loneRoot = computeMindMapNodeVisualScale(1, {
      ...base,
      nodeCountScaleInfluence: 0.5,
      singleRootOnlyVisualScaleFactor: 0.5,
    });
    const loneRootFull = computeMindMapNodeVisualScale(1, {
      ...base,
      nodeCountScaleInfluence: 0.5,
      singleRootOnlyVisualScaleFactor: 1,
    });
    expect(loneRoot).toBeCloseTo(loneRootFull * 0.5, 5);
  });
});

describe("viewport option builders", () => {
  it("uses configured root ratio and single-root scale per surface", () => {
    const editor = buildMindMapCanvasFocusedViewBoxOptions(null, "editor");
    const thumb = buildMindMapThumbnailFocusedViewBoxOptions();
    expect(thumb.targetRootScreenRatio).toBeCloseTo(
      getMindMapThumbnailTargetRootScreenRatio(),
      8,
    );
    expect(editor.targetRootScreenRatio).toBeCloseTo(
      getMindMapEditorFocusedTargetRootScreenRatio(),
      8,
    );
    expect(editor.singleRootOnlyVisualScaleFactor).toBe(1);
    expect(thumb.singleRootOnlyVisualScaleFactor).toBe(1);
  });

  it("filterMindMapFocusedNodeBounds keeps only root for single-root documents", () => {
    const bounds = [
      { x: 0, y: 0, width: 100, height: 40 },
      { x: 120, y: 10, width: 20, height: 20 },
    ];
    expect(filterMindMapFocusedNodeBounds(bounds, true)).toEqual([bounds[0]]);
    expect(filterMindMapFocusedNodeBounds(bounds, false)).toEqual(bounds);
  });
});

describe("computeMindMapFocusedViewBoxFromNodeBounds", () => {
  it("keeps the root node inside the view even with a large offset limit", () => {
    const viewBox = computeMindMapFocusedViewBoxFromNodeBounds(
      [
        { x: 0, y: 0, width: 100, height: 40 },
        { x: 5000, y: 0, width: 100, height: 40 },
      ],
      {
        targetAspect: 2,
        targetRootScreenRatio: 0.1,
        baselineNodeCount: 10,
        minVisualScaleNodeCount: 40,
        singleNodeVisualScale: 1,
        minNodeVisualScale: 1,
        nodeCountScaleInfluence: 1,
        centerTowardOthersRatio: 1,
        rootCenterLimitRatio: 0.8,
      },
    );

    expect(viewBox).not.toBeNull();
    expect(viewBox!.rootBounds.x).toBeGreaterThanOrEqual(viewBox!.x);
    expect(viewBox!.rootBounds.x + viewBox!.rootBounds.width).toBeLessThanOrEqual(
      viewBox!.x + viewBox!.width,
    );
  });

  it("normalizes root offset limit so 1 means root reaches the view edge", () => {
    const bounds = [
      { x: 0, y: 0, width: 100, height: 40 },
      { x: 5000, y: 0, width: 100, height: 40 },
    ];
    const options = {
      targetAspect: 2,
      targetRootScreenRatio: 0.1,
      baselineNodeCount: 10,
      minVisualScaleNodeCount: 40,
      singleNodeVisualScale: 1,
      minNodeVisualScale: 1,
      nodeCountScaleInfluence: 1,
      centerTowardOthersRatio: 1,
    };

    const half = computeMindMapFocusedViewBoxFromNodeBounds(bounds, {
      ...options,
      rootCenterLimitRatio: 0.5,
    });
    const edge = computeMindMapFocusedViewBoxFromNodeBounds(bounds, {
      ...options,
      rootCenterLimitRatio: 1,
    });
    const over = computeMindMapFocusedViewBoxFromNodeBounds(bounds, {
      ...options,
      rootCenterLimitRatio: 2,
    });

    expect(half).not.toBeNull();
    expect(edge).not.toBeNull();
    expect(over).not.toBeNull();
    expect(half!.rootBounds.x).toBeGreaterThan(half!.x);
    expect(edge!.rootBounds.x).toBeCloseTo(edge!.x, 5);
    expect(over!.x).toBeCloseTo(edge!.x, 5);
  });

  it("normalizes center offset strength between root and other nodes", () => {
    const bounds = [
      { x: 0, y: 0, width: 100, height: 40 },
      { x: 400, y: 0, width: 100, height: 40 },
    ];
    const options = {
      targetAspect: 2,
      targetRootScreenRatio: 0.1,
      baselineNodeCount: 10,
      minVisualScaleNodeCount: 40,
      singleNodeVisualScale: 1,
      minNodeVisualScale: 1,
      nodeCountScaleInfluence: 1,
      rootCenterLimitRatio: 1,
    };

    const none = computeMindMapFocusedViewBoxFromNodeBounds(bounds, {
      ...options,
      centerTowardOthersRatio: -1,
    });
    const full = computeMindMapFocusedViewBoxFromNodeBounds(bounds, {
      ...options,
      centerTowardOthersRatio: 1,
    });
    const over = computeMindMapFocusedViewBoxFromNodeBounds(bounds, {
      ...options,
      centerTowardOthersRatio: 2,
    });

    expect(none).not.toBeNull();
    expect(full).not.toBeNull();
    expect(over).not.toBeNull();
    expect(none!.rootScreen.centerX).toBeCloseTo(50, 5);
    expect(over!.x).toBeCloseTo(full!.x, 5);
  });
});
