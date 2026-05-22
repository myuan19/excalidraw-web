import { describe, expect, it } from "vitest";

import {
  computeExcalidrawThumbnailSceneBounds,
  expandRectToMinimumSize,
} from "./thumbnailViewport";
import {
  FILE_LIST_THUMB_EXPORT_PADDING,
  FILE_LIST_THUMB_MIN_VIEWPORT_HEIGHT,
  FILE_LIST_THUMB_MIN_VIEWPORT_WIDTH,
} from "./thumbnailExport";

describe("expandRectToMinimumSize", () => {
  it("expands tiny rects to the minimum viewport centered", () => {
    const expanded = expandRectToMinimumSize(
      { x: 0, y: 0, width: 18, height: 18 },
      240,
      144,
    );

    expect(expanded.width).toBe(240);
    expect(expanded.height).toBe(144);
    expect(expanded.x).toBeCloseTo(-111, 6);
    expect(expanded.y).toBeCloseTo(-63, 6);
  });
});

describe("computeExcalidrawThumbnailSceneBounds", () => {
  it("matches export padding and minimum viewport expansion", () => {
    const bounds = computeExcalidrawThumbnailSceneBounds([
      {
        id: "rect-1",
        type: "rectangle",
        x: 10,
        y: 20,
        width: 8,
        height: 8,
        angle: 0,
        strokeColor: "#000",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 1,
        opacity: 100,
        seed: 1,
        version: 1,
        versionNonce: 1,
        isDeleted: false,
        groupIds: [],
        frameId: null,
        boundElements: null,
        updated: 1,
        link: null,
        locked: false,
      } as any,
    ]);

    expect(bounds).not.toBeNull();
    const [x1, y1, x2, y2] = bounds!;
    const width = x2 - x1;
    const height = y2 - y1;

    expect(width).toBeCloseTo(FILE_LIST_THUMB_MIN_VIEWPORT_WIDTH, 6);
    expect(height).toBeCloseTo(FILE_LIST_THUMB_MIN_VIEWPORT_HEIGHT, 6);

    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;
    expect(centerX).toBeCloseTo(14, 6);
    expect(centerY).toBeCloseTo(24, 6);
  });
});
