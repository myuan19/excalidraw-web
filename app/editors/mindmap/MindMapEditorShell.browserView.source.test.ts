import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("MindMapEditorShell browser viewport source contract", () => {
  it("persists MindMap viewport locally and injects it into native payloads", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "MindMapEditorShell.tsx"),
      "utf8",
    );

    const bridgePayloadSource = fs.readFileSync(
      path.join(__dirname, "mindMapBridgePayload.ts"),
      "utf8",
    );

    expect(bridgePayloadSource).toContain("applyMindMapBrowserView");
    expect(bridgePayloadSource).toContain("applyBrowserView?: boolean");
    expect(source).toContain("saveMindMapBrowserView(fileId, event.data.payload)");
    expect(source).toContain("event.data.type === \"mindMapViewState\"");
    expect(source).toContain("event.data.type === \"saveMindMapThumbnail\"");
    expect(source).not.toContain(
      "saveMindMapBrowserViewFromData(fileId, savePayload.data)",
    );
    expect(source).toContain("toNativeMindMapBridgePayload(data, fileId,");
  });

  it("keeps live remote refresh from applying shared browser view", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "MindMapEditorShell.tsx"),
      "utf8",
    );
    const loadFromServerBlock = source.slice(
      source.indexOf("const loadFromServer = async"),
      source.indexOf("if (\n          shouldOpenCachedDocumentFirst"),
    );
    const reloadBlock = source.slice(
      source.indexOf("const reloadMindMapFromServer = useCallback"),
      source.indexOf("const reloadFromCrossTabSave = useCallback"),
    );

    expect(source).toContain("applyBrowserView: !opts?.preserveViewport");
    expect(loadFromServerBlock).toContain("if (!opts?.preserveViewport)");
    expect(source).toContain(
      'await loadFromServer("remote-hash-changed-after-cache", {\n                preserveViewport: true,',
    );
    expect(reloadBlock).toContain("if (!opts?.preserveViewport)");
    expect(source).toContain("preserveViewport: true");
  });
});
