import {
  MindMapAdapter,
  SIMPLE_MIND_MAP_VERSION,
  stripMindMapViewportState,
  type MindMapDocumentData,
} from "../../data/formats/MindMapAdapter";

import { applyMindMapMediaLimitsToConfig } from "./mindMapMediaLimits";
import { stampMindMapDataSourceVersion } from "./mindMapBridgeProtocol";
import { normalizeMindMapTheme } from "./mindMapThemeNormalize.js";
import previewViewportConfig from "./native/previewViewportConfig.json";

export interface MindMapEmbedBridgePayload {
  mindMapData: MindMapDocumentData;
  mindMapConfig: Record<string, unknown>;
  lang: string;
  localConfig: Record<string, unknown> | null;
  embedMode: true;
  readOnly: true;
}

export function prepareMindMapEmbedData(raw: unknown): MindMapDocumentData {
  return MindMapAdapter.parse(raw);
}

export function buildMindMapEmbedBridgePayload(
  data: unknown,
): MindMapEmbedBridgePayload {
  const parsed = prepareMindMapEmbedData(data);
  const stripped = stripMindMapViewportState(parsed);
  // 只读 embed 预览统一居中：视图状态（含过期 viewport）已在 parse/normalize 阶段剥离，
  // 不再用其偏置预览焦点，避免按陈旧 viewport 漂移。
  const mindMapConfig = applyMindMapMediaLimitsToConfig({
    ...(stripped.config ?? {}),
    __nbPreviewTargetX: 0.5,
    __nbPreviewTargetY: 0.5,
    __nbPreviewRootScreenRatioMultiplier:
      previewViewportConfig.embedFocusedRootScreenRatioMultiplier,
  });
  const mindMapData = stampMindMapDataSourceVersion(
    {
      ...stripped,
      theme: normalizeMindMapTheme(
        stripped.theme,
      ) as unknown as MindMapDocumentData["theme"],
      config: mindMapConfig,
    },
    SIMPLE_MIND_MAP_VERSION,
  );
  return {
    mindMapData,
    mindMapConfig,
    lang: typeof mindMapData.lang === "string" ? mindMapData.lang : "zh",
    localConfig:
      mindMapData.localConfig && typeof mindMapData.localConfig === "object"
        ? (mindMapData.localConfig as Record<string, unknown>)
        : null,
    embedMode: true,
    readOnly: true,
  };
}
