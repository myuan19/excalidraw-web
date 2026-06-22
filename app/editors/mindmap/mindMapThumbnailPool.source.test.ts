import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "../../..");

describe("MindMap thumbnail iframe pool source contract", () => {
  it("pools hidden iframe with warm + stage logging", () => {
    const source = fs.readFileSync(
      path.join(
        repoRoot,
        "app/editors/mindmap/mindMapNativeThumbnailRenderer.ts",
      ),
      "utf8",
    );

    expect(source).toContain("class MindMapThumbnailIframePool");
    expect(source).toContain("warmMindMapThumbnailIframe");
    expect(source).toContain("NATIVE_THUMBNAIL_WARM_TIMEOUT_MS");
    expect(source).toContain("NATIVE_THUMBNAIL_RENDER_TIMEOUT_MS");
    expect(source).toContain("mindmap-thumb-pool stage");
    expect(source).toContain("generateMindMapThumb FAILED");
    expect(source).toContain("setMindMapEditorHostActive");
    expect(source).toContain("scheduleMindMapThumbnailIframeWarm");
    expect(source).toContain("editor-host-active");
    expect(source).toContain("initMindMap");
    expect(source).toContain("hostExportDraftThumbnail");
  });

  it("prefetches thumbnail iframe warm on file list ready", () => {
    const mindmapPlugin = fs.readFileSync(
      path.join(repoRoot, "app/editors/mindmap/index.ts"),
      "utf8",
    );
    const registry = fs.readFileSync(
      path.join(repoRoot, "app/editors/registry.ts"),
      "utf8",
    );
    const editorShell = fs.readFileSync(
      path.join(repoRoot, "app/editors/mindmap/MindMapEditorShell.tsx"),
      "utf8",
    );

    expect(mindmapPlugin).toContain("warmFileListAssets");
    expect(mindmapPlugin).toContain("scheduleMindMapThumbnailIframeWarm");
    expect(registry).toContain("plugin.warmFileListAssets?.()");
    expect(editorShell).toContain("setMindMapEditorHostActive(true)");
  });
});
