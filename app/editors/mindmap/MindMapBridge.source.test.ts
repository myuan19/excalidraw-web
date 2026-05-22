import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "../..");

function readBridgeShell(relativePath: string): string {
  return fs.readFileSync(path.join(appRoot, relativePath), "utf8");
}

describe("MindMap bridge source contract", () => {
  it.each([
    "editors/mindmap/native/web/public/index.html",
    "editors/mindmap/native/index.html",
    "../public/mind-map/index.html",
  ])("%s treats viewport changes as view state only", (relativePath) => {
    const source = readBridgeShell(relativePath);
    const dataChangeBlock = source.slice(
      source.indexOf("window.$bus.$on('data_change'"),
      source.indexOf("window.$bus.$on('view_data_change'"),
    );
    const viewChangeBlock = source.slice(
      source.indexOf("window.$bus.$on('view_data_change'"),
      source.indexOf("// 思维导图实例创建完成事件"),
    );

    expect(dataChangeBlock).toContain("postToHost('mindMapDirtyState'");
    expect(viewChangeBlock).toContain("postToHost('mindMapViewState'");
    expect(viewChangeBlock).toContain("viewData =>");
    expect(viewChangeBlock).toContain("postToHost('mindMapViewState', viewData)");
    expect(viewChangeBlock).not.toContain("postToHost('mindMapDirtyState'");
    expect(source).not.toContain("mindMapScaleState");
    expect(source).toContain("saveMindMapThumbnail");
    expect(source).toContain("scheduleDraftThumbnailExport");
  });
});
