import { describe, expect, it, vi } from "vitest";

vi.mock("@excalidraw/excalidraw", () => ({
  exportToSvg: vi.fn(async ({ elements }: { elements?: unknown[] } = {}) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("viewBox", "0 0 18 18");
    svg.innerHTML = elements?.length
      ? '<path d="M0 0L18 0L0 18Z" fill="#111111"/>'
      : '<rect width="18" height="18" fill="#ffffff"/>';
    return svg;
  }),
}));

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
      elements: [{ id: "tiny-triangle" }],
      appState: { viewBackgroundColor: "#ffffff" },
      files: {},
    });

    const [x, y, width, height] = getViewBoxNumbers(svg);
    expect(width).toBeCloseTo(480, 6);
    expect(height).toBeCloseTo(288, 6);
    expect(x).toBeCloseTo(-231, 6);
    expect(y).toBeCloseTo(-135, 6);
    expect(svg).toContain('data-excal-filelist-thumb="1"');
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
