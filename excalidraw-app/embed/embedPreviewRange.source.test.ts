import { readFileSync } from "node:fs";

const readSource = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("embed preview range contract", () => {
  it("routes every Excalidraw embed preview trigger through one preview range entrypoint", () => {
    const source = readSource("./ExcalidrawEmbedViewer.tsx");

    expect(source).toContain("const applyExcalidrawPreviewRange = useCallback");
    expect(source).toContain('applyExcalidrawPreviewRange("initial-load")');
    expect(source).toContain('applyExcalidrawPreviewRange("button-locate")');
    expect(source).toContain('"host-embed-locate"');
    expect(source).toContain('"host-embed-refit"');
    expect(source).toContain('applyExcalidrawPreviewRange("resize-refit")');
    expect(source).toContain('defaultViewportSource.current = "preview-range"');
    expect(source).not.toContain("fitToOverview");
  });

  it("routes every MindMap embed preview trigger through the preview range contract", () => {
    const source = readSource("./MindMapEmbedViewer.tsx");

    expect(source).toContain("const applyMindMapPreviewRange = useCallback");
    expect(source).toContain("buildMindMapEmbedBridgePayload(mindMapData)");
    expect(source).toContain('type: "restoreMindMapView"');
    expect(source).toContain('reason: "embed-button"');
    expect(source).toContain("applyMindMapPreviewRange()");
    expect(source).not.toContain("restoreMindMapView = useCallback");
  });

  it("keeps the legacy combined embed viewer on the same preview range contract", () => {
    const source = readSource("../EmbedViewer.tsx");

    expect(source).toContain("const applyExcalidrawPreviewRange = useCallback");
    expect(source).toContain("const applyMindMapPreviewRange = useCallback");
    expect(source).toContain('applyExcalidrawPreviewRange("initial-load")');
    expect(source).toContain('applyExcalidrawPreviewRange("button-locate")');
    expect(source).toContain("onClick={applyMindMapPreviewRange}");
    expect(source).not.toContain("fitToOverview");
    expect(source).not.toContain("restoreMindMapView = useCallback");
  });
});
