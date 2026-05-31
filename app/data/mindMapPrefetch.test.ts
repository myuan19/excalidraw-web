import {
  extractMindMapAssetUrls,
  normalizeMindMapAssetHref,
  prefetchMindMapNativeAssets,
  resolveMindMapAssetUrl,
} from "./mindMapPrefetch";
import { afterEach, vi } from "vitest";

afterEach(() => {
  document.head.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MindMap native asset prefetch", () => {
  it("extracts script and stylesheet assets from the native iframe html", () => {
    const html = `
      <link href=/mind-map/dist/css/app.123.css rel=stylesheet>
      <link rel="stylesheet" href="./dist/css/chunk-vendors.css">
      <script src="/mind-map/dist/js/app.456.js"></script>
      <script src="./dist/js/chunk-vendors.js"></script>
      <img src="/mind-map/logo.png">
      <script src="/mind-map/dist/js/app.456.js"></script>
    `;

    expect(extractMindMapAssetUrls(html, "/mind-map/index.html")).toEqual([
      "/mind-map/dist/css/app.123.css",
      "/mind-map/dist/css/chunk-vendors.css",
      "/mind-map/dist/js/app.456.js",
      "/mind-map/dist/js/chunk-vendors.js",
    ]);
  });

  it("strips html-webpack query hash from asset hrefs", () => {
    expect(
      normalizeMindMapAssetHref("/mind-map/dist/js/app.9d1741a9.js?020435b02593c20fdc21"),
    ).toBe("/mind-map/dist/js/app.9d1741a9.js");
  });

  it("resolves relative iframe asset urls under /mind-map/", () => {
    expect(resolveMindMapAssetUrl("./dist/js/app.js", "/mind-map/index.html"))
      .toBe("/mind-map/dist/js/app.js");
  });

  it("resolves relative iframe asset urls under /embed/mind-map/", () => {
    expect(
      resolveMindMapAssetUrl(
        "./dist/js/app.js",
        "/embed/mind-map/index.html",
      ),
    ).toBe("/embed/mind-map/dist/js/app.js");
  });

  it("prefetches native assets without prefetching the html shell", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () =>
        '<script src="./dist/js/app.js"></script><link href="./dist/css/app.css" rel="stylesheet">',
    }));
    vi.stubGlobal("fetch", fetchMock);

    await prefetchMindMapNativeAssets("/mind-map/index.html");

    const prefetchedUrls = Array.from(
      document.querySelectorAll("link[data-mindmap-prefetch]"),
      (link) => link.getAttribute("href"),
    );
    expect(prefetchedUrls).toEqual([
      "/mind-map/dist/js/app.js",
      "/mind-map/dist/css/app.css",
    ]);
    expect(prefetchedUrls).not.toContain("/mind-map/index.html");
  });
});
