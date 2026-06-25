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

function getEmbedPreviewTarget(view: unknown): {
  x: number;
  y: number;
} {
  const state =
    view && typeof view === "object" && !Array.isArray(view)
      ? (view as Record<string, unknown>).state
      : null;
  const x =
    state && typeof state === "object" && !Array.isArray(state)
      ? (state as Record<string, unknown>).x
      : null;
  return {
    x: typeof x === "number" && Number.isFinite(x) ? (x < 0 ? 0.4 : 0.6) : 0.5,
    y: 0.5,
  };
}

export function buildMindMapEmbedBridgePayload(
  data: unknown,
): MindMapEmbedBridgePayload {
  const parsed = prepareMindMapEmbedData(data);
  const stripped = stripMindMapViewportState(parsed);
  const previewTarget = getEmbedPreviewTarget(parsed.view);
  const mindMapConfig = applyMindMapMediaLimitsToConfig({
    ...(stripped.config ?? {}),
    __nbPreviewTargetX: previewTarget.x,
    __nbPreviewTargetY: previewTarget.y,
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
