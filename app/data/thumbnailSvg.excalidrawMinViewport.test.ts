import { describe, expect, it } from "vitest";

import {
  buildSceneThumbnailSvg,
  thumbnailSvgHasVisibleContent,
} from "./thumbnailSvg";

const getViewBoxNumbers = (svg: string) =>
  svg
    .match(/viewBox="([^"]+)"/)![1]
    .split(/\s+/)
    .map(Number);

describe("Excalidraw thumbnail minimum viewport", () => {
  it("keeps tiny drawings from filling the file-list thumbnail", async () => {
    const svg = await buildSceneThumbnailSvg({
      elements: [
        {
          id: "tiny-rect",
          type: "rectangle",
          x: 0,
          y: 0,
          width: 18,
          height: 18,
          angle: 0,
          strokeColor: "#111111",
          backgroundColor: "transparent",
          strokeWidth: 1,
          opacity: 100,
          isDeleted: false,
        },
      ],
      appState: { viewBackgroundColor: "#ffffff" },
      files: {},
    });

    const [x, y, width, height] = getViewBoxNumbers(svg);
    expect(width).toBeCloseTo(480, 6);
    expect(height).toBeCloseTo(288, 6);
    expect(x).toBeCloseTo(-231, 6);
    expect(y).toBeCloseTo(-135, 6);
    expect(svg).toContain('data-excal-filelist-thumb="1"');
    expect(svg).toContain("<rect");
    expect(svg).toContain('stroke="#111111"');
    expect(thumbnailSvgHasVisibleContent(svg)).toBe(true);
  });

  it("does not treat background-only SVGs as visible thumbnails", async () => {
    const svg = await buildSceneThumbnailSvg({
      elements: [],
      appState: { viewBackgroundColor: "#ffffff" },
      files: {},
    });

    expect(thumbnailSvgHasVisibleContent(svg)).toBe(false);
  });
});
