import { describe, expect, it } from "vitest";
import {
  buildEmbedBootstrapScript,
  injectEmbedBootstrap,
} from "./embedPageHtml.js";

describe("embed page html helpers", () => {
  it("injects a small bootstrap without embedding document data", () => {
    const html = [
      "<!doctype html>",
      "<html>",
      "<head></head>",
      "<body>",
      '<div id="root"></div>',
      '<script type="module" src="/assets/embed-entry.js"></script>',
      "</body>",
      "</html>",
    ].join("");

    const result = injectEmbedBootstrap(html, {
      fileId: "file-1",
      fileName: "Board",
      kind: "mindmap",
      token: "tok_1",
    });

    expect(result).toContain("window.__EXCALIDRAW_EMBED_BOOTSTRAP__");
    expect(result).toContain("window.__EXCALIDRAW_EMBED_MODE__=true");
    expect(result).toContain('"dataUrl":"/embed/api/file-1/data?_t=tok_1"');
    expect(result).not.toContain("__EXCALIDRAW_EMBED_DATA__");
    expect(result).not.toContain("current.excalidraw");
  });

  it("escapes bootstrap script content", () => {
    const script = buildEmbedBootstrapScript({
      fileId: "file-1",
      fileName: "</script><script>alert(1)</script>",
      kind: "excalidraw",
      token: "tok_1",
    });

    expect(script).not.toContain("</script><script>");
    expect(script).toContain("\\u003c/script\\u003e");
  });
});
