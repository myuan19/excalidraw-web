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
  it.each(["editors/mindmap/native/web/src/bridge/takeoverShell.js"])(
    "%s treats viewport changes as view state only",
    (relativePath) => {
      const source = readBridgeShell(relativePath);
      const dataChangeBlock = source.slice(
        source.indexOf("const notifyDirty = "),
        source.indexOf("window.$bus.$on('view_data_change'"),
      );
      const viewChangeBlock = source.slice(
        source.indexOf("window.$bus.$on('view_data_change'"),
        source.indexOf("// 思维导图实例创建完成事件"),
      );

      expect(dataChangeBlock).toContain("postToHost('mindMapDirtyState'");
      expect(dataChangeBlock).toContain(
        "window.$bus.$on('data_change', data =>",
      );
      expect(dataChangeBlock).toContain(
        "debugMindMapOpen('bus data_change received'",
      );
      expect(dataChangeBlock).toContain(
        "source: 'bus:data_change'",
      );
      expect(viewChangeBlock).toContain("postToHost('mindMapViewState'");
      expect(viewChangeBlock).toContain("viewData =>");
      expect(viewChangeBlock).toContain(
        "postToHost('mindMapViewState', viewData)",
      );
      expect(viewChangeBlock).not.toContain("postToHost('mindMapDirtyState'");
      expect(source).not.toContain("mindMapScaleState");
      expect(source).toContain("saveMindMapThumbnail");
      expect(source).toContain("scheduleDraftThumbnailExport");
      expect(source).toContain("exportMindMapThumbnailSnapshot");
      expect(source).toContain("forceLoadNode");
    },
  );

  it("exports draft thumbnails after force rendering the full node tree", () => {
    const source = readBridgeShell(
      "editors/mindmap/native/web/src/bridge/takeoverShell.js",
    );
    const exportBlock = source.slice(
      source.indexOf("const exportThumbnailForSnapshot"),
      source.indexOf("const exportMindMapThumbnailSnapshot"),
    );
    const draftExportBlock = source.slice(
      source.indexOf("const exportMindMapThumbnailSnapshot"),
      source.indexOf("const scheduleDraftThumbnailExport"),
    );
    expect(exportBlock).toContain("forceLoadNode");
    expect(exportBlock).toContain("waitForNodeTreeRenderEnd");
    expect(exportBlock).toContain("ensureCanvasMatchesSnapshot");
    expect(draftExportBlock).toContain("syncPendingTextEditForSnapshot");
    expect(draftExportBlock).toContain("usePersistCopy: true");
    expect(draftExportBlock).toContain("exportThumbnailForSnapshot");
    expect(source).toContain("exportMindMapThumbnailSnapshot(");
  });

  it("schedules draft thumbnails by readiness instead of a fixed debounce", () => {
    const source = readBridgeShell(
      "editors/mindmap/native/web/src/bridge/takeoverShell.js",
    );
    const scheduleBlock = source.slice(
      source.indexOf("const scheduleDraftThumbnailExport"),
      source.indexOf("const postMindMapDataToHost"),
    );

    expect(source).not.toContain("DRAFT_THUMB_EXPORT_DEBOUNCE_MS");
    expect(scheduleBlock).toContain("waitForNextFrame().then(runWhenReady)");
    expect(scheduleBlock).toContain("draftThumbExportInFlight");
    expect(scheduleBlock).not.toContain("setTimeout");
  });

  it("syncs active text edits before collecting save data and thumbnail", () => {
    const source = readBridgeShell(
      "editors/mindmap/native/web/src/bridge/takeoverShell.js",
    );
    const saveRequestBlock = source.slice(
      source.indexOf("if (message.type === 'requestMindMapSave')"),
      source.indexOf("if (message.type === 'updateRootText'"),
    );
    const postDataBlock = source.slice(
      source.indexOf("const postMindMapDataToHost = async (data, requestId, thumbnail"),
      source.indexOf("const resolveHostRequest = message =>"),
    );

    const collectBlock = source.slice(
      source.indexOf("const collectMindMapSaveSnapshot"),
      source.indexOf("const ensureCanvasMatchesSnapshot"),
    );
    const thumbnailExportBlock = source.slice(
      source.indexOf("const exportThumbnailForSnapshot"),
      source.indexOf("const exportMindMapThumbnailSnapshot"),
    );
    expect(source).toContain("syncPendingTextEditForSnapshot");
    expect(collectBlock).toContain("usePersistCopy: true");
    expect(collectBlock).not.toContain("forceLoadNode");
    expect(thumbnailExportBlock).toContain("ensureCanvasMatchesSnapshot");
    expect(thumbnailExportBlock).toContain("forceLoadNode");
    expect(saveRequestBlock).toContain("collectMindMapSaveSnapshot");
    expect(saveRequestBlock).toContain("exportThumbnailForSnapshot");
    expect(saveRequestBlock).toContain("debugMindMapOpen('requestMindMapSave | received'");
    expect(saveRequestBlock).toContain("reportMindMapSaveProgress(requestId, 'skipped-not-ready'");
    expect(
      saveRequestBlock.indexOf("collectMindMapSaveSnapshot"),
    ).toBeLessThan(saveRequestBlock.indexOf("exportThumbnailForSnapshot"));
    expect(
      saveRequestBlock.indexOf("exportThumbnailForSnapshot"),
    ).toBeLessThan(saveRequestBlock.indexOf("postMindMapDataToHost"));
    expect(postDataBlock).toContain("if (!thumbnail)");
    expect(postDataBlock).toContain("scheduleDraftThumbnailExport(revision)");
  });

  it("suppresses draft pushes to host while hydrate dirty notify is disabled", () => {
    const source = readBridgeShell(
      "editors/mindmap/native/web/src/bridge/takeoverShell.js",
    );
    expect(source).toContain("postMindMapDataToHost draft push suppressed");
    expect(source).toContain("if (!dirtyNotifyEnabled)");
  });

  it("treats node expand/collapse as a user edit command", () => {
    const source = readBridgeShell(
      "editors/mindmap/native/web/src/bridge/takeoverShell.js",
    );
    const commandBlock = source.slice(
      source.indexOf("const userEditCommandNames = new Set(["),
      source.indexOf("const notifyDirty = "),
    );
    const afterCommandBlock = source.slice(
      source.indexOf("nativeMindMap.on('afterExecCommand'"),
      source.indexOf("window.$bus.$on('node_tree_render_end'"),
    );

    expect(commandBlock).toContain("'SET_NODE_EXPAND'");
    expect(afterCommandBlock).toContain(
      "if (!userEditCommandNames.has(commandName))",
    );
    expect(afterCommandBlock).toContain("userEdit: true");
    expect(afterCommandBlock).toContain("reason: `command:${commandName}`");
  });

  it("skips host data pushes whose content matches the canvas", () => {
    const source = readBridgeShell(
      "editors/mindmap/native/web/src/bridge/takeoverShell.js",
    );
    expect(source).toContain("getMindMapFullDataFingerprint");
    expect(source).toContain("applyHostMindMapData('set-mind-map-data')");
    expect(source).toContain("applyHostMindMapData('init-mind-map-repeat')");
    // 推送应用收敛到单一入口，禁止绕过指纹比对直接 setFullData
    expect(source).not.toContain(
      "nativeMindMap.setFullData(bridgeState.mindMapData)",
    );
  });

  it("reports save progress over the bridge and logs details in debugMindMapOpen", () => {
    const source = readBridgeShell(
      "editors/mindmap/native/web/src/bridge/takeoverShell.js",
    );
    expect(source).toContain("debugMindMapOpen('requestMindMapSave | snapshot start'");
    expect(source).toContain("debugMindMapOpen('requestMindMapSave | posted'");
    expect(source).toContain("wait node_tree_render_end start");
    expect(source).toContain("postToHost('mindMapSaveProgress'");
    expect(source).toContain("reportMindMapSaveProgress");
    expect(source).toContain("'skipped-not-ready'");
    expect(source).not.toContain("mindMapSaveTrace");
    expect(source).not.toContain("traceMindMapSave");
  });

  it("forwards host debug logs into iframe console", () => {
    const source = readBridgeShell(
      "editors/mindmap/native/web/src/bridge/takeoverShell.js",
    );
    expect(source).toContain("message.type === 'mindMapHostDebug'");
    expect(source).toContain("debugMindMapHostForward");
    expect(source).toContain("summarizeMindMapPayloadRichText");
  });

  it("index.html loads external takeover bridge before vue bundles", () => {
    const html = readBridgeShell("editors/mindmap/native/web/public/index.html");
    expect(html).toContain('src="dist/bridge/takeover-shell.js"');
    expect(html).not.toContain("const bridgeSource = ");
  });
});
