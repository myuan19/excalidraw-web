import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function readBridgeShell(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("MindMap bridge source contract", () => {
  it.each([
    "mind-map/web/public/index.html",
    "mind-map/index.html",
    "public/mind-map/index.html",
  ])("%s treats viewport changes as view state only", (relativePath) => {
    const source = readBridgeShell(relativePath);
    const dataChangeBlock = source.slice(
      source.indexOf("window.$bus.$on('data_change'"),
      source.indexOf("window.$bus.$on('view_data_change'"),
    );
    const viewChangeBlock = source.slice(
      source.indexOf("window.$bus.$on('view_data_change'"),
      source.indexOf("window.$bus.$on('scale'"),
    );

    expect(dataChangeBlock).toContain("postToHost('mindMapDirtyState'");
    expect(viewChangeBlock).toContain("postToHost('mindMapViewState'");
    expect(viewChangeBlock).toContain("viewData =>");
    expect(viewChangeBlock).toContain("postToHost('mindMapViewState', viewData)");
    expect(viewChangeBlock).not.toContain("postToHost('mindMapDirtyState'");
  });
});
