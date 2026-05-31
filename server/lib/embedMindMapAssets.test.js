import { describe, expect, it } from "vitest";
import {
  isAllowedMindMapEmbedAssetPath,
  rewriteMindMapCssForEmbed,
  rewriteMindMapHtmlForEmbed,
} from "./embedMindMapAssets.js";

describe("embed mind-map asset rewriting", () => {
  it("rewrites iframe html resources to embed paths without query tokens", () => {
    const html = [
      '<link rel="icon" href="dist/logo.ico">',
      '<link href="dist/css/app.css?abc" rel="stylesheet">',
      '<script src="/mind-map/dist/js/app.js?abc"></script>',
      '<img src="./dist/img/logo.png">',
    ].join("");

    expect(rewriteMindMapHtmlForEmbed(html)).toContain(
      'href="/embed/mind-map/dist/logo.ico"',
    );
    expect(rewriteMindMapHtmlForEmbed(html)).toContain(
      'href="/embed/mind-map/dist/css/app.css?abc"',
    );
    expect(rewriteMindMapHtmlForEmbed(html)).toContain(
      'src="/embed/mind-map/dist/js/app.js?abc"',
    );
    expect(rewriteMindMapHtmlForEmbed(html)).toContain(
      'src="/embed/mind-map/dist/img/logo.png"',
    );
    expect(rewriteMindMapHtmlForEmbed(html)).not.toContain("_t=");
  });

  it("rewrites css url references relative to the current mind-map asset", () => {
    const css = [
      "@font-face{src:url(../fonts/icon.woff2)}",
      ".logo{background:url('../img/logo.png?abc')}",
      ".inline{background:url(data:image/png;base64,abc)}",
    ].join("");

    expect(rewriteMindMapCssForEmbed(css, "dist/css/app.css")).toBe(
      [
        "@font-face{src:url(/embed/mind-map/dist/fonts/icon.woff2)}",
        ".logo{background:url('/embed/mind-map/dist/img/logo.png?abc')}",
        ".inline{background:url(data:image/png;base64,abc)}",
      ].join(""),
    );
  });

  it("only allows the mind-map iframe entry and dist assets", () => {
    expect(isAllowedMindMapEmbedAssetPath("index.html")).toBe(true);
    expect(isAllowedMindMapEmbedAssetPath("dist/js/app.js")).toBe(true);
    expect(isAllowedMindMapEmbedAssetPath("logo.ico")).toBe(false);
    expect(isAllowedMindMapEmbedAssetPath("config.json")).toBe(false);
  });
});
