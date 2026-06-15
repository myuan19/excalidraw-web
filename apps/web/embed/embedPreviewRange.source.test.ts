import { readFileSync } from "node:fs";

const readSource = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("embed preview range contract", () => {
  it("routes every Excalidraw embed preview trigger through one preview range entrypoint", () => {
    const source = readSource("./ExcalidrawEmbedViewer.tsx");

    expect(source).toContain("const applyExcalidrawPreviewRange = useCallback");
    expect(source).toContain('applyExcalidrawPreviewRange("initial-load")');
    expect(source).toContain('applyExcalidrawPreviewRange("button-locate")');
    expect(source).toContain("handleResetView");
    expect(source).not.toContain("togglePin");
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
    expect(source).toContain("handleResetView");
    expect(source).not.toContain("togglePin");
    expect(source).toContain("useEmbedIframeAutoLock");
    expect(source).not.toContain("restoreMindMapView = useCallback");
  });

  it("uses editor-focused viewport naming in MindMap Edit.vue", () => {
    const source = readSource(
      "../editors/mindmap/native/web/src/pages/Edit/components/Edit.vue",
    );

    expect(source).toContain("EDITOR_FOCUSED_ROOT_SCREEN_RATIO_MULTIPLIER");
    expect(source).toContain("applyEmbedFocusedViewport");
    expect(source).toContain("applyEditorFocusedViewport");
    expect(source).not.toContain("applyEmbedLayoutViewport");
    expect(source).not.toContain("applyEmbedPreviewViewport");
    expect(source).not.toContain("EMBED_PREVIEW_TARGET_ROOT_SCREEN_RATIO");
    expect(source).not.toContain("embedRootScreenRatioMultiplier");
    expect(source).toContain("notifyEmbedPreviewViewportApplied");
    expect(source).toContain("embed_preview_viewport_applied");
  });

  it("reports preview viewport success only after viewport apply succeeds", () => {
    const bridgeSource = readSource(
      "../editors/mindmap/native/web/public/index.html",
    );

    expect(bridgeSource).toContain("embed_preview_viewport_applied");
    expect(bridgeSource).toContain("mindMapIframeError");
    expect(bridgeSource).toContain("host_restore_preview_view");
    expect(bridgeSource).toContain("__nbApplyHostViewport");
    expect(bridgeSource).not.toContain("__nbApplyEmbedPreviewViewport");
    expect(bridgeSource).not.toContain("nativeMindMap.view.fit()");
    expect(bridgeSource).toContain("ok: false");
  });
});
