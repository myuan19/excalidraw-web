import { afterEach, describe, expect, it } from "vitest";

import { saveMindMapBrowserView } from "../../data/mindMapBrowserViewStorage";

import { mindMapDataWithStrongChild } from "./mindMapHydrateDraftPolicy";
import { toNativeMindMapBridgePayload } from "./mindMapBridgePayload";

describe("toNativeMindMapBridgePayload", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("applies browser view by default for editor open", () => {
    const view = {
      transform: { scaleX: 1, scaleY: 1, translateX: 120, translateY: -40 },
      state: { scale: 1, x: 120, y: -40, sx: 0, sy: 0 },
    };
    saveMindMapBrowserView("mindmap-file", view);

    const payload = toNativeMindMapBridgePayload(
      mindMapDataWithStrongChild("<p><span>root</span></p>"),
      "mindmap-file",
    );

    expect(payload.mindMapData.view).toEqual(view);
  });

  it("strips view for live refresh payloads", () => {
    const storedView = {
      transform: { scaleX: 1, scaleY: 1, translateX: 120, translateY: -40 },
      state: { scale: 1, x: 120, y: -40, sx: 0, sy: 0 },
    };
    saveMindMapBrowserView("mindmap-file", storedView);
    const legacyServerView = {
      transform: { scaleX: 2, scaleY: 2, translateX: 999, translateY: 999 },
      state: { scale: 2, x: 999, y: 999, sx: 0, sy: 0 },
    };

    const payload = toNativeMindMapBridgePayload(
      {
        ...mindMapDataWithStrongChild("<p><span>root</span></p>"),
        view: legacyServerView,
      },
      "mindmap-file",
      { applyBrowserView: false },
    );

    expect(payload.mindMapData.view).toBeUndefined();
  });

  it("normalizes payload envelope defaults for native", () => {
    const payload = toNativeMindMapBridgePayload(
      {
        ...mindMapDataWithStrongChild("<p><span>root</span></p>"),
        lang: 123,
        localConfig: "invalid",
      },
      null,
    );

    expect(payload.lang).toBe("zh");
    expect(payload.localConfig).toBe(null);
    expect(payload.mindMapData.root).toHaveProperty("smmVersion");
    expect(payload.mindMapConfig).toHaveProperty(
      "__nbPreviewRootScreenRatioMultiplier",
    );
  });
});
