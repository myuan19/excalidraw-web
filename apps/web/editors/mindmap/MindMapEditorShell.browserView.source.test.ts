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

    expect(source).toContain("toNativeMindMapBridgePayload");
    expect(source).not.toContain("applyMindMapBrowserView");
    expect(bridgePayloadSource).toContain("applyMindMapBrowserView");
    expect(bridgePayloadSource).toContain("applyBrowserView?: boolean");
    expect(source).toContain(
      "scheduleSaveMindMapBrowserView(fileId, event.data.payload)",
    );
    expect(source).toContain('event.data.type === "mindMapViewState"');
    expect(source).toContain('event.data.type === "saveMindMapThumbnail"');
    expect(source).not.toContain(
      "saveMindMapBrowserViewFromData(fileId, savePayload.data)",
    );
    expect(source).toContain("toNativeMindMapBridgePayload(data, fileId");
  });

  it("keeps live remote refresh from applying shared browser view", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "MindMapEditorShell.tsx"),
      "utf8",
    );
    const nativeBridgeSource = fs.readFileSync(
      path.join(__dirname, "native/web/src/bridge/takeoverShell.js"),
      "utf8",
    );

    expect(source).toContain("preserveViewport?: boolean");
    expect(source).toContain("applyBrowserView: !opts?.preserveViewport");
    expect(source).toContain(
      'publishMindMapDocument(document.data, "server-reload",',
    );
    expect(source).toContain("preserveViewport: true");
    expect(nativeBridgeSource).toContain(
      "preserve current view for host mindMapData apply",
    );
    expect(nativeBridgeSource).toContain(
      "nativeMindMap.setFullData(dataToApply)",
    );
  });

  it("skips leave-time native snapshot requests when stored MindMap state is clean", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "MindMapEditorShell.tsx"),
      "utf8",
    );

    expect(source).toContain("canSkipMindMapNativeSyncOnLeave");
    const requestNativeSaveBlock = source.slice(
      source.indexOf("const requestNativeSave = useCallback("),
      source.indexOf("const persistNativeThumbnail = useCallback("),
    );

    expect(requestNativeSaveBlock).toContain('source === "exit"');
    expect(requestNativeSaveBlock).toContain(
      "canSkipMindMapNativeSyncOnLeave(fileId)",
    );
    expect(
      requestNativeSaveBlock.indexOf("canSkipMindMapNativeSyncOnLeave"),
    ).toBeLessThan(
      requestNativeSaveBlock.indexOf('postToNative("requestMindMapSave"'),
    );
  });
});
