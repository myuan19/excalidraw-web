import { describe, expect, it } from "vitest";

import {
  normalizeMindMapIndexHtml,
  stripMindMapChunkPreloads,
  stripWebpackHtmlQueryHashes,
} from "./mind-map-webpack-chunks.mjs";

describe("mind-map index html normalization", () => {
  it("strips html-webpack query hash on content-hashed assets", () => {
    const html =
      '<link href="dist/css/app.7150c861.css?020435b02593c20fdc21" rel="stylesheet">';
    expect(stripWebpackHtmlQueryHashes(html)).toBe(
      '<link href="dist/css/app.7150c861.css" rel="stylesheet">',
    );
  });

  it("removes crossorigin chunk preloads", () => {
    const html = `  <head>
    <link rel="preload" href="dist/js/chunk-abc.0609fc47.js" as="script" crossorigin>
  </head>`;
    expect(stripMindMapChunkPreloads(html)).not.toContain("rel=\"preload\"");
  });

  it("applies both normalizers", () => {
    const html = `<link href="dist/js/app.9d1741a9.js?020435b02593c20fdc21" rel="preload" as="script" crossorigin>
<link rel="preload" href="dist/js/chunk-x.11111111.js" as="script" crossorigin>`;
    const out = normalizeMindMapIndexHtml(html);
    expect(out).not.toContain("?020435b0");
    expect(out).not.toContain('rel="preload"');
  });
});
