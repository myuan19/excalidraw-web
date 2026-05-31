import { describe, expect, it, vi } from "vitest";

import { MindMapHostBridge } from "./mindMapHostBridge";
import type { NativeMindMapBridgePayload } from "./mindMapBridgeProtocol";

const emptyPayload = (): NativeMindMapBridgePayload => ({
  mindMapData: {
    root: { data: { text: "root" }, children: [] },
    theme: { template: "classic4", config: {} },
    layout: "logicalStructure",
    config: {},
    view: null,
  },
  mindMapConfig: {},
  lang: "zh",
  localConfig: null,
});

describe("MindMapHostBridge", () => {
  it("transitions mounting → bridge_ready → init_sent on ready + publish", () => {
    const phases: string[] = [];
    const postMessage = vi.fn();
    const iframe = {
      contentWindow: { postMessage },
      src: "http://localhost/mind-map/index.html",
      getAttribute: (name: string) =>
        name === "src" ? "http://localhost/mind-map/index.html" : null,
      dataset: {},
    } as unknown as HTMLIFrameElement;

    const bridge = new MindMapHostBridge({
      getIframe: () => iframe,
      callbacks: {
        onSnapshot: (s) => phases.push(s.phase),
      },
    });

    bridge.beginSession();
    expect(phases.at(-1)).toBe("mounting");

    bridge.publishDocument(emptyPayload(), "test");
    bridge.handleNativeMessage(
      { source: "simple-mind-map-native", type: "ready" },
      window.location.origin,
    );
    expect(phases).toContain("bridge_ready");
    expect(phases).toContain("init_sent");
    expect(postMessage).toHaveBeenCalled();
  });

  it("reaches app_ready on appInited", () => {
    let ready = false;
    const postMessage = vi.fn();
    const iframe = {
      contentWindow: { postMessage },
      src: "http://localhost/mind-map/index.html",
      getAttribute: (name: string) =>
        name === "src" ? "http://localhost/mind-map/index.html" : null,
      dataset: {},
    } as unknown as HTMLIFrameElement;

    const bridge = new MindMapHostBridge({
      getIframe: () => iframe,
      callbacks: {
        onSnapshot: () => {},
        onNativeReady: (v) => {
          ready = v;
        },
      },
    });

    bridge.beginSession();
    bridge.handleNativeMessage(
      { source: "simple-mind-map-native", type: "ready" },
      window.location.origin,
    );
    bridge.handleNativeMessage(
      { source: "simple-mind-map-native", type: "appInited" },
      window.location.origin,
    );

    expect(bridge.getSnapshot().phase).toBe("app_ready");
    expect(ready).toBe(true);
  });
});
