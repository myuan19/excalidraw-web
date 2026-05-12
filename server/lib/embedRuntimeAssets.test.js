import { describe, expect, it } from "vitest";
import vm from "node:vm";
import { buildEmbedRuntimeAssetInterceptor } from "./embedRuntimeAssets.js";

function createRuntime(encodedToken = "tok_123") {
  const script = buildEmbedRuntimeAssetInterceptor(encodedToken)
    .replace(/^<script>/, "")
    .replace(/<\/script>$/, "");
  const calls = {
    fetch: [],
    fontFace: [],
  };
  const context = {
    window: {
      location: { origin: "https://excalidraw.test" },
      fetch: (url, options) => {
        calls.fetch.push([url, options]);
        return "fetch-result";
      },
      FontFace: function FontFace(family, source, descriptors) {
        calls.fontFace.push([family, source, descriptors]);
      },
    },
    URL,
  };
  context.window.FontFace.prototype = {};
  vm.runInNewContext(script, context);
  return { window: context.window, calls };
}

describe("embed runtime asset interceptor", () => {
  it("adds embed token to runtime font URLs", () => {
    const { window, calls } = createRuntime();

    window.fetch("/embed/fonts/Virgil/Virgil-Regular.woff2");
    new window.FontFace(
      "Virgil",
      'url("/embed/fonts/Virgil/Virgil-Regular.woff2") format("woff2")',
    );

    expect(calls.fetch[0][0]).toBe(
      "/embed/fonts/Virgil/Virgil-Regular.woff2?_t=tok_123",
    );
    expect(calls.fontFace[0][1]).toBe(
      'url("/embed/fonts/Virgil/Virgil-Regular.woff2?_t=tok_123") format("woff2")',
    );
  });

  it("maps bare font and asset paths to token-gated embed routes", () => {
    const { window, calls } = createRuntime();

    window.fetch("fonts/Xiaolai/font.woff2");
    window.fetch("/assets/index.js");

    expect(calls.fetch[0][0]).toBe("/embed/fonts/Xiaolai/font.woff2?_t=tok_123");
    expect(calls.fetch[1][0]).toBe("/embed/assets/index.js?_t=tok_123");
  });

  it("does not duplicate existing embed tokens", () => {
    const { window, calls } = createRuntime();

    window.fetch("/embed/fonts/Virgil/Virgil-Regular.woff2?_t=old");

    expect(calls.fetch[0][0]).toBe(
      "/embed/fonts/Virgil/Virgil-Regular.woff2?_t=old",
    );
  });
});
