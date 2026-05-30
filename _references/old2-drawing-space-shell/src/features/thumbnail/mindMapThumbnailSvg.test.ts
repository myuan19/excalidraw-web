import { describe, expect, it } from "vitest";
import {
  normalizeMindMapThumbnailSvg,
  patchThumbnailSvgForCard,
  sanitizeThumbnailSvg,
} from "./mindMapThumbnailSvg";

describe("mindMapThumbnailSvg", () => {
  it("removes mind map edit overlays", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><g class="smm-hover-node"></g><g class="smm-node">ok</g></svg>`;
    const out = normalizeMindMapThumbnailSvg(svg);
    expect(out).not.toContain("smm-hover-node");
    expect(out).toContain("smm-node");
  });

  it("patches card thumbnails to meet viewport", () => {
    const svg = '<svg width="200" height="100"><rect /></svg>';
    const out = patchThumbnailSvgForCard(svg);
    expect(out).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(out).toContain('width="100%"');
  });

  it("strips style-fonts blocks", () => {
    const svg = '<svg><style class="style-fonts">@font-face{}</style><rect /></svg>';
    expect(sanitizeThumbnailSvg(svg)).not.toContain("style-fonts");
  });
});
