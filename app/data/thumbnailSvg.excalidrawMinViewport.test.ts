import { describe, expect, it, vi } from "vitest";

vi.mock("@excalidraw/excalidraw", () => ({
  exportToSvg: vi.fn(async () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("viewBox", "0 0 18 18");
    svg.innerHTML = '<path d="M0 0L18 0L0 18Z" fill="#111111"/>';
    return svg;
  }),
}));

import { buildSceneThumbnailSvg } from "./thumbnailSvg";

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
    expect(width).toBeCloseTo(240, 6);
    expect(height).toBeCloseTo(144, 6);
    expect(x).toBeCloseTo(-111, 6);
    expect(y).toBeCloseTo(-63, 6);
    expect(svg).toContain('data-excal-filelist-thumb="1"');
  });
});
