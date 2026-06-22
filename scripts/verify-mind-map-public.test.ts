import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { listWebpackLazyChunks } from "./mind-map-webpack-chunks.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const indexPath = path.join(root, "public/mind-map/index.html");

describe("verify-mind-map-public contract", () => {
  it("public/mind-map/index.html is a bridge shell with matching dist assets", () => {
    expect(fs.existsSync(indexPath)).toBe(true);
    const html = fs.readFileSync(indexPath, "utf8");
    expect(html).toContain('src="dist/bridge/takeover-shell.js"');
    const bridgeShell = fs.readFileSync(
      path.join(root, "public/mind-map/dist/bridge/takeover-shell.js"),
      "utf8",
    );
    expect(bridgeShell).toContain("simple-mind-map-native");
    expect(bridgeShell).toContain("postToHost('appInited')");
    expect(bridgeShell).toContain("mindMapIframeError");

    const scriptSrcs = [
      ...html.matchAll(/\bsrc="(dist\/[^"?]+\.js)(?:\?[^"]*)?"/g),
    ].map((match) => match[1]);

    expect(scriptSrcs.length).toBeGreaterThan(0);
    for (const rel of scriptSrcs) {
      expect(fs.existsSync(path.join(root, "public/mind-map", rel))).toBe(true);
    }

    const lazyChunks = listWebpackLazyChunks(
      path.join(root, "public/mind-map/dist/js"),
    );
    expect(lazyChunks.length).toBeGreaterThan(0);
    expect(html).not.toContain('rel="preload" href="dist/');
  });
});
