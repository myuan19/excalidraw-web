import { SIMPLE_MIND_MAP_VERSION } from "../../data/formats/MindMapAdapter";
import { applyMindMapBrowserView } from "../../data/mindMapBrowserViewStorage";

import { applyMindMapMediaLimitsToConfig } from "./mindMapMediaLimits";
import {
  stampMindMapDataSourceVersion,
  type NativeMindMapBridgePayload,
} from "./mindMapBridgeProtocol";
import { normalizeMindMapTheme } from "./mindMapThemeNormalize.js";
import previewViewportConfig from "./native/previewViewportConfig.json";

import type { MindMapDocumentData } from "../../data/formats/MindMapAdapter";

export type MindMapBridgePayloadOptions = {
  applyBrowserView?: boolean;
};

function stripMindMapView(data: MindMapDocumentData): MindMapDocumentData {
  if (!("view" in data)) {
    return data;
  }
  const { view: _view, ...withoutView } = data;
  return withoutView as MindMapDocumentData;
}

export function toNativeMindMapBridgePayload(
  data: MindMapDocumentData,
  fileId: string | null,
  opts?: MindMapBridgePayloadOptions,
): NativeMindMapBridgePayload {
  const withView =
    opts?.applyBrowserView === false
      ? stripMindMapView(data)
      : applyMindMapBrowserView(data, fileId);
  const mindMapData = stampMindMapDataSourceVersion(
    {
      ...withView,
      theme: normalizeMindMapTheme(
        withView.theme,
      ) as unknown as MindMapDocumentData["theme"],
    },
    SIMPLE_MIND_MAP_VERSION,
  );
  const mindMapConfig = applyMindMapMediaLimitsToConfig({
    ...(mindMapData.config ?? {}),
  });
  if (!mindMapData.view) {
    mindMapConfig.__nbPreviewRootScreenRatioMultiplier =
      previewViewportConfig.editorRootScreenRatioMultiplier;
  }
  return {
    mindMapData,
    mindMapConfig,
    lang: typeof mindMapData.lang === "string" ? mindMapData.lang : "zh",
    localConfig:
      mindMapData.localConfig && typeof mindMapData.localConfig === "object"
        ? (mindMapData.localConfig as Record<string, unknown>)
        : null,
  };
}
