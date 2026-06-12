import { afterEach, vi } from "vitest";

import {
  buildMindMapThumbnailSvg,
  buildSceneThumbnailSvg,
  mindMapRichTextToPlainText,
  normalizeMindMapThumbnailSvg,
  patchThumbnailSvgForCard,
} from "./thumbnailSvg";
import previewViewportConfig from "../editors/mindmap/native/previewViewportConfig.json";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

const getViewBoxNumbers = (svg: string) =>
  svg
    .match(/viewBox="([^"]+)"/)![1]
    .split(/\s+/)
    .map(Number);

const getViewBoxCenter = (svg: string) => {
  const [x, y, width, height] = getViewBoxNumbers(svg);
  return {
    x: x + width / 2,
    y: y + height / 2,
  };
};

const getScreenCenterPercent = (svg: string, point: { x: number; y: number }) => {
  const [x, y, width, height] = getViewBoxNumbers(svg);
  return {
    x: ((point.x - x) / width) * 100,
    y: ((point.y - y) / height) * 100,
  };
};

const expectWithinConfiguredRootLimit = (screenPoint: {
  x: number;
  y: number;
}) => {
  const limit =
    previewViewportConfig.thumbnailRootCenterLimitRatio ??
    previewViewportConfig.rootCenterLimitRatio;
  const minPercent = (0.5 - limit) * 100;
  const maxPercent = (0.5 + limit) * 100;
  expect(screenPoint.x).toBeGreaterThanOrEqual(minPercent - 0.01);
  expect(screenPoint.x).toBeLessThanOrEqual(maxPercent + 0.01);
  expect(screenPoint.y).toBeGreaterThanOrEqual(minPercent - 0.01);
  expect(screenPoint.y).toBeLessThanOrEqual(maxPercent + 0.01);
};

const nativePathNode = (
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
  isRoot = false,
) =>
  '<g class="smm-node" transform="matrix(1,0,0,1,' +
  `${x},${y})">` +
  `<path class="smm-node-shape" d="M0 0L${width} 0L${width} ${height}L0 ${height}Z"></path>` +
  (!isRoot
    ? `<rect fill="transparent" width="20" height="${height - 4}" x="${width + 2}" y="0"></rect>`
    : "") +
  `<text>${label}</text>` +
  `<rect class="smm-hover-node" width="${width}" height="${height}"></rect>` +
  "</g>";

describe("MindMap SVG thumbnails", () => {
  it("builds an eager import thumbnail from MindMap document data", async () => {
    const svg = await buildMindMapThumbnailSvg({
      root: {
        data: { text: "<p>产品规划</p>", richText: true },
        children: [
          {
            data: { text: "<p>调研</p>", richText: true },
            children: [],
          },
        ],
      },
    });

    expect(svg).toContain('data-excal-filelist-thumb="1"');
    expect(svg).toContain('data-excal-thumb-bg="#ffffff"');
    expect(svg).toContain(">产品规划</text>");
    expect(svg).toContain(">调研</text>");
    expect(svg).not.toContain("&lt;p&gt;");
  });

  it("uses the configured root offset and visible limit ratios", () => {
    expect(previewViewportConfig.thumbnailCenterTowardOthersRatio).toBe(0.55);
    expect(previewViewportConfig.thumbnailRootCenterLimitRatio).toBe(0.8);
    expect(previewViewportConfig.editorEmbedCenterTowardOthersRatio).toBe(0.55);
    expect(previewViewportConfig.editorEmbedRootCenterLimitRatio).toBe(0.8);
    expect(previewViewportConfig.thumbnailRootScreenRatioMultiplier).toBe(0.85);
    expect(previewViewportConfig.editorRootScreenRatioMultiplier).toBe(0.1125);
    expect(previewViewportConfig.embedFocusedRootScreenRatioMultiplier).toBe(
      0.504,
    );
    expect(previewViewportConfig.editorEmbedSingleRootOnlyVisualScaleFactor).toBe(
      1,
    );
    expect(previewViewportConfig.thumbnailSingleRootOnlyVisualScaleFactor).toBe(
      1,
    );
  });

  it(
    "renders empty Excalidraw scenes as a blank thumbnail with background content",
    async () => {
      const svg = await buildSceneThumbnailSvg({
        elements: [],
        appState: {},
        files: {},
      });

      expect(svg).toContain('data-excal-filelist-thumb="1"');
      expect(svg).toContain('viewBox="0 0 16 16"');
      expect(svg).toMatch(/<rect\b[^>]*fill="#ffffff"/);
    },
    30_000,
  );

  it("normalizes size-only SVGs for inline card rendering", () => {
    const svg =
      '<svg width="240" height="120"><rect width="240" height="120"/></svg>';

    expect(normalizeMindMapThumbnailSvg(svg)).toContain(
      'xmlns="http://www.w3.org/2000/svg"',
    );
    expect(normalizeMindMapThumbnailSvg(svg)).toContain(
      'viewBox="0 0 240 120"',
    );
  });

  it("patches MindMap SVGs to fill the card while preserving aspect ratio", () => {
    const svg =
      '<svg width="240" height="120"><rect width="240" height="120"/></svg>';

    expect(patchThumbnailSvgForCard(svg)).toContain('width="100%"');
    expect(patchThumbnailSvgForCard(svg)).toContain('height="100%"');
    expect(patchThumbnailSvgForCard(svg)).toContain(
      'preserveAspectRatio="xMidYMid meet"',
    );
    expect(patchThumbnailSvgForCard(svg)).toContain('viewBox="0 0 240 120"');
  });

  it("patches MindMap SVGs with namespaced root attributes", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 240 120" width="240" height="120">' +
      '<rect width="240" height="120"/></svg>';
    const patched = patchThumbnailSvgForCard(svg);

    expect(patched).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
    expect(patched).toContain('width="100%"');
    expect(patched).toContain('height="100%"');
    expect(patched).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(patched).toContain('viewBox="0 0 240 120"');
  });

  it("focuses native MindMap thumbnails around the root instead of the full panorama", () => {
    const svg =
      '<svg width="1526.5" height="385" style="background-color: rgb(241, 241, 241);">' +
      '<g class="smm-container" transform="matrix(1,0,0,1,-631,-188.5)">' +
      '<g class="smm-node" transform="matrix(1,0,0,1,640,360)">' +
      '<rect width="154" height="45"></rect>' +
      "</g>" +
      '<g class="smm-node" transform="matrix(1,0,0,1,1100,360)">' +
      '<rect width="120" height="38"></rect>' +
      "</g>" +
      "</g></svg>";
    const result = normalizeMindMapThumbnailSvg(svg);

    const [x, y, width, height] = getViewBoxNumbers(result);
    expect(x).toBeCloseTo(-87.3, 1);
    expect(y).toBeCloseTo(-58.09, 1);
    expect(width).toBeCloseTo(833.89, 1);
    expect(height).toBeCloseTo(500.34, 1);
  });

  it("centers a single-root MindMap thumbnail without clamping to the exported bounds", () => {
    const svg =
      '<svg width="900" height="540">' +
      '<g class="smm-container" transform="matrix(1,0,0,1,0,0)">' +
      '<g class="smm-node" transform="matrix(1,0,0,1,180,250)">' +
      '<rect width="154" height="45"></rect>' +
      "</g>" +
      "</g>" +
      '<foreignObject width="900" height="30" x="0" y="510">' +
      '<div class="footer" xmlns="http://www.w3.org/1999/xhtml">维护报告</div>' +
      "</foreignObject>" +
      "</svg>";

    const result = normalizeMindMapThumbnailSvg(svg);
    const [x, y, width, height] = getViewBoxNumbers(result);
    const center = getViewBoxCenter(result);

    expect(x).toBeCloseTo(-152.23, 1);
    expect(y).toBeCloseTo(26.96, 1);
    expect(width).toBeCloseTo(818.45, 1);
    expect(height).toBeCloseTo(491.07, 1);
    expect(center.x).toBeCloseTo(257, 1);
    expect(center.y).toBeCloseTo(272.5, 1);
  });

  it("handles a single-root node with no transform attribute", () => {
    const svg =
      '<svg width="900" height="540">' +
      '<g class="smm-container" transform="matrix(1,0,0,1,0,0)">' +
      '<g class="smm-node">' +
      '<rect width="154" height="45"></rect>' +
      "</g>" +
      "</g></svg>";

    const result = normalizeMindMapThumbnailSvg(svg);
    const [, , width, height] = getViewBoxNumbers(result);

    expect(width).toBeCloseTo(818.45, 1);
    expect(height).toBeCloseTo(491.07, 1);
    expect(result).toContain("viewBox=");
  });

  it("ignores MindMap add controls when choosing the root thumbnail focus", () => {
    const svg =
      '<svg width="900" height="540">' +
      '<g class="smm-container" transform="matrix(1,0,0,1,0,0)">' +
      '<g class="smm-node-add" transform="matrix(1,0,0,1,760,430)">' +
      '<circle cx="24" cy="24" r="48" fill="#888"></circle>' +
      '<path d="M18 24H30M24 18V30"></path>' +
      "</g>" +
      '<g class="smm-other-container"><text>维护报告</text></g>' +
      '<g class="smm-node" transform="matrix(1,0,0,1,180,250)">' +
      '<path class="smm-node-shape" d="M0 0H154V45H0Z"></path>' +
      '<g><foreignObject width="118" height="29">' +
      '<div class="smm-richtext-node-wrap" xmlns="http://www.w3.org/1999/xhtml">中心主题</div>' +
      "</foreignObject></g>" +
      "</g>" +
      "</g>" +
      '<foreignObject width="900" height="30" x="0" y="510">' +
      '<div class="footer" xmlns="http://www.w3.org/1999/xhtml">维护报告</div>' +
      "</foreignObject>" +
      "</svg>";

    const result = normalizeMindMapThumbnailSvg(svg);
    const center = getViewBoxCenter(result);

    expect(center.x).toBeCloseTo(257, 1);
    expect(center.y).toBeCloseTo(272.5, 1);
    expect(result).not.toContain("smm-node-add");
    expect(result).not.toContain("维护报告");
    expect(result).toContain("smm-node-shape");
    expect(result).toContain("中心主题");
  });

  it("uses native path node bounds and removes inline MindMap action buttons", () => {
    const svg =
      '<svg width="900" height="540">' +
      '<g class="smm-container" transform="matrix(1,0,0,1,0,0)">' +
      '<g class="smm-node active" transform="matrix(1,0,0,1,180,250)">' +
      '<path class="smm-node-shape" d="M0 0L154 0L154 45L0 45Z"></path>' +
      '<rect class="smm-hover-node" width="500" height="200" x="-100" y="-70"></rect>' +
      '<g class="smm-quick-create-child-btn" transform="matrix(1,0,0,1,170,23)">' +
      '<circle width="18" height="18" fill="#fff"></circle>' +
      '<svg width="18" height="18"><path d="M4 9H14M9 4V14"></path></svg>' +
      "</g>" +
      '<g class="smm-expand-btn" transform="matrix(1,0,0,1,170,23)">' +
      '<circle width="18" height="18" fill="#fff"></circle>' +
      "</g>" +
      '<text>中心主题</text>' +
      "</g>" +
      "</g></svg>";

    const result = normalizeMindMapThumbnailSvg(svg);
    const center = getViewBoxCenter(result);

    expect(center.x).toBeCloseTo(257, 1);
    expect(center.y).toBeCloseTo(272.5, 1);
    expect(result).not.toContain("smm-quick-create-child-btn");
    expect(result).not.toContain("smm-expand-btn");
    expect(result).not.toContain("active");
    expect(result).toContain("smm-node-shape");
  });

  it("pulls the configured target back when it would push the root outside the visible limit", () => {
    const svg =
      '<svg width="3200" height="900">' +
      '<g class="smm-container" transform="matrix(1,0,0,1,0,0)">' +
      '<g class="smm-node" transform="matrix(1,0,0,1,600,420)">' +
      '<rect width="154" height="45"></rect>' +
      "</g>" +
      '<g class="smm-node" transform="matrix(1,0,0,1,1700,420)">' +
      '<rect width="120" height="38"></rect>' +
      "</g>" +
      '<g class="smm-node" transform="matrix(1,0,0,1,2800,420)">' +
      '<rect width="120" height="38"></rect>' +
      "</g>" +
      "</g></svg>";

    const [x, y, width, height] = getViewBoxNumbers(
      normalizeMindMapThumbnailSvg(svg),
    );
    expect(x).toBeCloseTo(931.98, 1);
    expect(y).toBeCloseTo(185.6, 1);
    expect(width).toBeCloseTo(849.93, 1);
    expect(height).toBeCloseTo(509.96, 1);
  });

  it("matches the focused experiment for native path-based wide sibling exports", () => {
    const siblings = Array.from({ length: 28 }, (_, index) =>
      nativePathNode(
        `同级节点 ${index + 1}`,
        560,
        80 + index * 64,
        index < 9 ? 129.2 : 145.4,
        38,
      ),
    ).join("");
    const svg =
      '<svg width="1600" height="1900">' +
      '<g class="smm-container" transform="matrix(1,0,0,1,0,0)">' +
      nativePathNode("中心主题", 260, 900, 154, 45, true) +
      siblings +
      "</g></svg>";

    const [x, y, width, height] = getViewBoxNumbers(
      normalizeMindMapThumbnailSvg(svg),
    );

    expect(x).toBeCloseTo(-62.66, 1);
    expect(y).toBeCloseTo(607.4, 1);
    expect(width).toBeCloseTo(1124.59, 1);
    expect(height).toBeCloseTo(674.75, 1);
  });

  it("does not let the node container consume the root node bounds", () => {
    const svg =
      '<svg width="1600" height="1900">' +
      '<g class="smm-container" transform="matrix(1,0,0,1,0,0)">' +
      '<g class="smm-node-container">' +
      nativePathNode("中心主题", 260, 900, 154, 45, true) +
      nativePathNode("同级节点 1", 560, 80, 129.2, 38) +
      nativePathNode("同级节点 2", 560, 144, 129.2, 38) +
      "</g></g></svg>";

    const normalized = normalizeMindMapThumbnailSvg(svg);
    const center = getViewBoxCenter(normalized);
    const rootScreen = getScreenCenterPercent(normalized, {
      x: 260 + 154 / 2,
      y: 900 + 45 / 2,
    });

    expect(center.x).toBeCloseTo(495.18, 1);
    expectWithinConfiguredRootLimit(rootScreen);
  });

  it("overrides stale cropped MindMap viewBoxes with the exported panorama bounds", () => {
    const svg =
      '<svg viewBox="208 444 783 470" width="1800" height="1400">' +
      '<g class="smm-container" transform="matrix(1,0,0,1,0,0)">' +
      '<g class="smm-node" transform="matrix(1,0,0,1,240,680)">' +
      '<rect width="154" height="45"></rect>' +
      "</g>" +
      '<g class="smm-node" transform="matrix(1,0,0,1,440,680)">' +
      '<rect width="120" height="38"></rect>' +
      "</g>" +
      "</g></svg>";

    const [x, y, width, height] = getViewBoxNumbers(
      normalizeMindMapThumbnailSvg(svg),
    );
    expect(x).toBeCloseTo(0.7, 1);
    expect(y).toBeCloseTo(450.41, 1);
    expect(width).toBeCloseTo(833.89, 1);
    expect(height).toBeCloseTo(500.34, 1);
  });

  it("keeps node-count visual scale between 1.2 and 0.8", () => {
    const svg =
      '<svg width="1800" height="1400">' +
      '<g class="smm-container" transform="matrix(1,0,0,1,0,0)">' +
      '<g class="smm-node" transform="matrix(1,0,0,1,240,680)">' +
      '<rect width="154" height="45" x="-2" y="-2" class="smm-hover-node"></rect>' +
      "</g>" +
      '<g class="smm-node" transform="matrix(1,0,0,1,440,80)"></g>' +
      '<g class="smm-node" transform="matrix(1,0,0,1,440,1280)"></g>' +
      "</g></svg>";

    const [, , width] = getViewBoxNumbers(normalizeMindMapThumbnailSvg(svg));
    const targetRootRatio =
      previewViewportConfig.baselineRootScreenRatio *
      previewViewportConfig.thumbnailRootScreenRatioMultiplier;
    const visualScale = 154 / width / targetRootRatio;

    expect(visualScale).toBeGreaterThanOrEqual(0.8);
    expect(visualScale).toBeLessThanOrEqual(1.2);
    expect(visualScale).toBeCloseTo(1.156, 1);
  });

  it("clamps the target center so the root stays inside the configured visible limit", () => {
    const svg =
      '<svg width="2200" height="1000">' +
      '<g class="smm-container" transform="matrix(1,0,0,1,0,0)">' +
      '<g class="smm-node" transform="matrix(1,0,0,1,180,400)">' +
      '<rect width="154" height="45"></rect>' +
      "</g>" +
      '<g class="smm-node" transform="matrix(1,0,0,1,1400,180)">' +
      '<rect width="120" height="38"></rect>' +
      "</g>" +
      '<g class="smm-node" transform="matrix(1,0,0,1,1590,350)">' +
      '<rect width="120" height="38"></rect>' +
      "</g>" +
      '<g class="smm-node" transform="matrix(1,0,0,1,1780,520)">' +
      '<rect width="120" height="38"></rect>' +
      "</g>" +
      "</g></svg>";

    const normalized = normalizeMindMapThumbnailSvg(svg);
    const center = getViewBoxCenter(normalized);
    const rootScreen = getScreenCenterPercent(normalized, {
      x: 180 + 154 / 2,
      y: 400 + 45 / 2,
    });

    expect(center.x).toBeCloseTo(950.28, 1);
    expect(center.y).toBeCloseTo(393.08, 1);
    expectWithinConfiguredRootLimit(rootScreen);
  });

  it("keeps the root inside the configured visible thumbnail area", () => {
    const distantNodes = Array.from({ length: 45 }, (_, index) =>
      nativePathNode(
        `远端节点 ${index + 1}`,
        2800 + index * 22,
        120 + (index % 10) * 62,
        120,
        38,
      ),
    ).join("");
    const svg =
      '<svg width="4200" height="1200">' +
      '<g class="smm-container" transform="matrix(1,0,0,1,0,0)">' +
      nativePathNode("中心主题", 180, 520, 154, 45, true) +
      distantNodes +
      "</g></svg>";

    const normalized = normalizeMindMapThumbnailSvg(svg);
    const [, , width] = getViewBoxNumbers(normalized);
    const rootScreen = getScreenCenterPercent(normalized, {
      x: 180 + 154 / 2,
      y: 520 + 45 / 2,
    });

    expect(width).toBeCloseTo(1227.68, 1);
    expectWithinConfiguredRootLimit(rootScreen);
  });

  it("uses the same focused MindMap logic for raw and card-patched thumbnails", () => {
    const svg =
      '<svg width="3200" height="900">' +
      '<g class="smm-container" transform="matrix(1,0,0,1,0,0)">' +
      '<g class="smm-node" transform="matrix(1,0,0,1,600,420)">' +
      '<rect width="154" height="45"></rect>' +
      "</g>" +
      '<g class="smm-node" transform="matrix(1,0,0,1,1700,420)">' +
      '<rect width="120" height="38"></rect>' +
      "</g>" +
      "</g></svg>";

    expect(getViewBoxNumbers(patchThumbnailSvgForCard(svg))).toEqual(
      getViewBoxNumbers(normalizeMindMapThumbnailSvg(svg)),
    );
  });

  it("does not log MindMap thumbnail geometry from stale browser flags", () => {
    vi.stubEnv("PROD", true);
    window.localStorage.setItem("excalidraw-web-debug-mindmap-thumbnail", "1");
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const svg =
      '<svg width="3200" height="900">' +
      '<g class="smm-container" transform="matrix(1,0,0,1,0,0)">' +
      '<g class="smm-node" transform="matrix(1,0,0,1,600,420)">' +
      '<rect width="154" height="45"></rect>' +
      "</g>" +
      '<g class="smm-node" transform="matrix(1,0,0,1,1700,420)">' +
      '<rect width="120" height="38"></rect>' +
      "</g>" +
      "</g></svg>";

    normalizeMindMapThumbnailSvg(svg);

    expect(consoleLog).not.toHaveBeenCalled();
  });

  it("does not enable MindMap thumbnail logs from broad debug flags", () => {
    vi.stubEnv("PROD", true);
    window.localStorage.setItem("excalidraw-web-debug", "1");
    window.localStorage.setItem("excalidraw-web-debug-thumbnail", "1");
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const svg =
      '<svg width="3200" height="900">' +
      '<g class="smm-container" transform="matrix(1,0,0,1,0,0)">' +
      '<g class="smm-node" transform="matrix(1,0,0,1,600,420)">' +
      '<rect width="154" height="45"></rect>' +
      "</g>" +
      '<g class="smm-node" transform="matrix(1,0,0,1,1700,420)">' +
      '<rect width="120" height="38"></rect>' +
      "</g>" +
      "</g></svg>";

    normalizeMindMapThumbnailSvg(svg);

    expect(consoleLog).not.toHaveBeenCalled();
  });

  it("removes MindMap edit overlays from exported thumbnails", () => {
    const svg =
      '<svg width="1200" height="720">' +
      '<g class="smm-container" transform="matrix(1,0,0,1,0,0)">' +
      '<g class="smm-node active smm-node-highlight" transform="matrix(1,0,0,1,320,320)">' +
      '<rect class="smm-hover-node" width="100" height="40"></rect>' +
      '<path class="smm-node-shape" d="M0 0L1 1"></path>' +
      "</g>" +
      '<g class="smm-associative-line-container">' +
      '<path d="M0 0L10 10"></path>' +
      '<line x1="0" y1="0" x2="10" y2="10"></line>' +
      '<circle cx="4" cy="4" r="10"></circle>' +
      "</g>" +
      "</g></svg>";

    const normalized = normalizeMindMapThumbnailSvg(svg);

    expect(normalized).not.toContain("smm-node active");
    expect(normalized).not.toContain("smm-node-highlight");
    expect(normalized).not.toContain("smm-hover-node");
    expect(normalized).not.toContain("<line");
    expect(normalized).not.toContain("<circle");
    expect(normalized).toContain('<path d="M0 0L10 10">');
    expect(normalized).toContain("smm-node-shape");
  });

  it("renders rich-text MindMap node labels as plain text in thumbnails", () => {
    const svg =
      '<svg width="240" height="120"><text>&lt;p&gt;写网页&lt;/p&gt;</text><text>&lt;p&gt;&lt;br&gt;&lt;/p&gt;</text></svg>';
    const normalized = normalizeMindMapThumbnailSvg(svg);

    expect(mindMapRichTextToPlainText("&lt;p&gt;vibe coding&lt;/p&gt;")).toBe(
      "vibe coding",
    );
    expect(normalized).toContain(">写网页</text>");
    expect(normalized).not.toContain("&lt;p&gt;");
    expect(normalized).not.toContain("&lt;br&gt;");
  });

  it("keeps native rich text when outer frames use nested groups in exported SVG", () => {
    const svg =
      '<svg width="900" height="540">' +
      '<g class="smm-container" transform="matrix(1,0,0,1,0,0)">' +
      '<g class="smm-line-container"><path d="M100 50L200 50" stroke="#888"/></g>' +
      '<g class="smm-node-container">' +
      '<g class="smm-node" transform="matrix(1,0,0,1,180,250)">' +
      '<path class="smm-node-shape" d="M0 0H154V45H0Z" fill="#fff"></path>' +
      '<foreignObject width="118" height="29">' +
      '<style>* { margin: 0; padding: 0; box-sizing: border-box; }</style>' +
      '<div class="smm-richtext-node-wrap" xmlns="http://www.w3.org/1999/xhtml">中心主题</div>' +
      "</foreignObject>" +
      "</g>" +
      "</g>" +
      '<g class="smm-outer-frame-container">' +
      '<rect width="220" height="120" fill="rgba(9,132,227,0.05)"></rect>' +
      '<g><text>分组</text></g>' +
      "</g>" +
      "</g></svg>";

    const normalized = normalizeMindMapThumbnailSvg(svg);

    expect(normalized).toContain("smm-richtext-node-wrap");
    expect(normalized).toContain("中心主题");
    expect(normalized).toContain("* { margin: 0;");
    expect(normalized).toContain("smm-node-shape");
    expect(normalized).not.toContain("smm-outer-frame-container");
    expect(normalized).not.toMatch(/<text\b[^>]*>\* \{ margin: 0;/);
    expect((normalized.match(/<\/g>/g) ?? []).length).toBe(
      (normalized.match(/<g\b/g) ?? []).length,
    );
  });
});
