import { sanitizeMindMapView } from "./mindMapView";

export const HOST_SOURCE = "excalidraw-web";
export const NATIVE_SOURCE = "simple-mind-map-native";
const env = (import.meta as unknown as { env?: Record<string, string> }).env;
export const NATIVE_MINDMAP_URL =
  env?.VITE_MINDMAP_DEV_URL || "/mind-map/index.html";

export interface MindMapDocumentData {
  root: Record<string, unknown>;
  config?: Record<string, unknown>;
  layout?: string;
  theme?: Record<string, unknown>;
  view?: Record<string, unknown>;
  lang?: string;
  localConfig?: Record<string, unknown> | null;
}

export interface MindMapSaveResult {
  data: MindMapDocumentData;
  thumbnail: string | null;
}

export function createEmptyMindMapData(): MindMapDocumentData {
  return {
    root: {
      data: {
        text: "<p>根节点</p>",
        richText: true,
        expand: true,
      },
      children: [],
    },
    layout: "logicalStructure",
    config: {},
    lang: "zh",
    localConfig: null,
  };
}

export function normalizeMindMapData(raw: unknown): MindMapDocumentData {
  if (!raw || typeof raw !== "object") {
    return createEmptyMindMapData();
  }
  const record = raw as Record<string, unknown>;
  const data = record.kind === "mindmap" && record.data && typeof record.data === "object"
    ? record.data as Record<string, unknown>
    : record;
  return {
    ...createEmptyMindMapData(),
    ...data,
    root: data.root && typeof data.root === "object"
      ? data.root as Record<string, unknown>
      : createEmptyMindMapData().root,
    config: data.config && typeof data.config === "object" ? data.config as Record<string, unknown> : {},
    localConfig: data.localConfig && typeof data.localConfig === "object"
      ? data.localConfig as Record<string, unknown>
      : null,
    lang: typeof data.lang === "string" ? data.lang : "zh",
    view: sanitizeMindMapView(data.view) ?? undefined,
  };
}

export function toBridgePayload(data: MindMapDocumentData) {
  const view = sanitizeMindMapView(data.view);
  const mindMapData = view ? { ...data, view } : { ...data, view: undefined };
  return {
    mindMapData,
    mindMapConfig: data.config ?? {},
    lang: data.lang ?? "zh",
    localConfig: data.localConfig ?? null,
  };
}

export function isNativeMindMapMessage(value: unknown): value is {
  source: typeof NATIVE_SOURCE;
  type: string;
  payload?: unknown;
} {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { source?: unknown }).source === NATIVE_SOURCE &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

export function decodeMindMapThumbnail(payload: unknown): string | null {
  if (typeof payload !== "string" || !payload) return null;
  if (!payload.startsWith("data:image/svg+xml")) return payload.includes("<svg") ? payload : null;
  const comma = payload.indexOf(",");
  if (comma === -1) return null;
  const meta = payload.slice(0, comma);
  const body = payload.slice(comma + 1);
  try {
    return meta.includes(";base64")
      ? new TextDecoder().decode(Uint8Array.from(atob(body), (c) => c.charCodeAt(0)))
      : decodeURIComponent(body);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isMindMapNode(node: unknown): node is Record<string, unknown> {
  return isRecord(node) && isRecord(node.data);
}

function nodeHasVisibleContent(node: Record<string, unknown>): boolean {
  const data = node.data as Record<string, unknown>;
  const text = typeof data.text === "string" ? data.text.replace(/<[^>]+>/g, "").trim() : "";
  if (text) return true;
  const children = Array.isArray(node.children) ? node.children : [];
  return children.some((child) => isMindMapNode(child) && nodeHasVisibleContent(child));
}

export function isEffectivelyEmptyMindMapData(data: unknown): boolean {
  return isRecord(data) && isMindMapNode(data.root) && !nodeHasVisibleContent(data.root);
}

export function parseMindMapSavePayload(payload: unknown): MindMapSaveResult {
  if (payload && typeof payload === "object" && "data" in payload) {
    return {
      data: normalizeMindMapData((payload as { data?: unknown }).data),
      thumbnail: decodeMindMapThumbnail((payload as { thumbnail?: unknown }).thumbnail),
    };
  }
  return { data: normalizeMindMapData(payload), thumbnail: null };
}
