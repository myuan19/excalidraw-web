import { SIMPLE_MIND_MAP_VERSION } from "../../data/formats/MindMapAdapter";
import { applyMindMapBrowserView } from "../../data/mindMapBrowserViewStorage";

import { applyMindMapMediaLimitsToConfig } from "./mindMapMediaLimits";
import {
  stampMindMapDataSourceVersion,
  type NativeMindMapBridgePayload,
} from "./mindMapBridgeProtocol";
import previewViewportConfig from "./native/previewViewportConfig.json";

import type { MindMapDocumentData } from "../../data/formats/MindMapAdapter";

export function toNativeMindMapBridgePayload(
  data: MindMapDocumentData,
  fileId: string | null,
): NativeMindMapBridgePayload {
  const mindMapData = stampMindMapDataSourceVersion(
    applyMindMapBrowserView(data, fileId),
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
    lang: mindMapData.lang ?? "zh",
    localConfig: mindMapData.localConfig ?? null,
  };
}
