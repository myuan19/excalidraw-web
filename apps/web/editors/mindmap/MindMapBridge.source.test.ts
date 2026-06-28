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
        source.indexOf("const notifyDirty = (opts = {}) =>"),
        source.indexOf("window.$bus.$on('view_data_change'"),
      );
      const viewChangeBlock = source.slice(
        source.indexOf("window.$bus.$on('view_data_change'"),
        source.indexOf("// 思维导图实例创建完成事件"),
      );

      expect(dataChangeBlock).toContain("postToHost('mindMapDirtyState'");
      expect(dataChangeBlock).toContain(
        "window.$bus.$on('data_change', notifyDirty)",
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
    },
  );

  it("syncs active text edits before collecting save data and thumbnail", () => {
    const source = readBridgeShell(
      "editors/mindmap/native/web/src/bridge/takeoverShell.js",
    );
    const saveRequestBlock = source.slice(
      source.indexOf("if (message.type === 'requestMindMapSave')"),
      source.indexOf("if (message.type === 'updateRootText'"),
    );

    expect(source).toContain("syncPendingTextEditForSnapshot");
    expect(source).toContain("collectMindMapDataForSnapshot");
    expect(source).toContain("waitForPendingInsertEditForSnapshot");
    expect(source).toContain("pendingInsertEditPromise");
    expect(saveRequestBlock).toContain("ensureRendered: false");
    expect(
      saveRequestBlock.indexOf("collectMindMapDataForSnapshot"),
    ).toBeLessThan(
      saveRequestBlock.indexOf("postMindMapDataToHost"),
    );
    expect(saveRequestBlock).not.toContain("nativeMindMap.getData(true)");
    expect(saveRequestBlock).toContain("requestMindMapSave.skipUnsettled");
    expect(source).toContain("collectMindMapDataForSnapshot.syncTextEditFailed");
  });

  it("suppresses draft pushes to host while hydrate dirty notify is disabled", () => {
    const source = readBridgeShell(
      "editors/mindmap/native/web/src/bridge/takeoverShell.js",
    );
    expect(source).toContain("postMindMapDataToHost draft push suppressed");
    expect(source).toContain("if (!dirtyNotifyEnabled && !draftUserEditMeta.userEdit)");
  });

  it("skips host data pushes whose content matches the canvas", () => {
    const source = readBridgeShell(
      "editors/mindmap/native/web/src/bridge/takeoverShell.js",
    );
    expect(source).toContain("getMindMapFullDataFingerprint");
    expect(source).toContain("collectMindMapTextRenderHealth");
    expect(source).toContain("expectedRichTextNodes");
    expect(source).toContain("collapsedForeignObjectCount");
    expect(source).toContain("text render unhealthy after force render");
    expect(source).toContain("applyHostMindMapData('set-mind-map-data')");
    expect(source).toContain("applyHostMindMapData('init-mind-map-repeat')");
    // 推送应用收敛到单一入口，禁止绕过指纹比对直接 setFullData
    expect(source).not.toContain(
      "nativeMindMap.setFullData(bridgeState.mindMapData)",
    );
  });

  it("requires expected rich-text nodes to have rendered foreignObjects", () => {
    const source = readBridgeShell(
      "editors/mindmap/native/web/src/bridge/takeoverShell.js",
    );
    const healthBlock = source.slice(
      source.indexOf("const collectMindMapTextRenderHealth"),
      source.indexOf("const ensureMindMapTextRendered"),
    );

    expect(healthBlock).toContain("hasAllExpectedRichText");
    expect(healthBlock).toContain("textForeignObjects.length");
    expect(healthBlock).toContain("expected.expectedRichTextNodes");
    expect(healthBlock.indexOf("hasAllExpectedRichText")).toBeLessThan(
      healthBlock.indexOf("health.healthy"),
    );
  });

  it("forwards host debug logs into iframe console", () => {
    const source = readBridgeShell(
      "editors/mindmap/native/web/src/bridge/takeoverShell.js",
    );
    expect(source).toContain("message.type === 'mindMapHostDebug'");
    expect(source).toContain("debugMindMapHostForward");
    expect(source).toContain("summarizeMindMapPayloadRichText");
  });

  it("routes native iframe messages only to the owning MindMap shell", () => {
    const source = readBridgeShell("editors/mindmap/MindMapEditorShell.tsx");

    expect(source).toContain("isMessageFromCurrentIframe(event.source)");
    expect(
      source.indexOf("isMessageFromCurrentIframe(event.source)"),
    ).toBeLessThan(
      source.indexOf("isAllowedNativeMindMapMessageOrigin(event.origin"),
    );
  });

  it("index.html loads external takeover bridge before vue bundles", () => {
    const html = readBridgeShell("editors/mindmap/native/web/public/index.html");
    expect(html).toContain('src="dist/bridge/takeover-shell.js"');
    expect(html).not.toContain("const bridgeSource = ");
  });
});
