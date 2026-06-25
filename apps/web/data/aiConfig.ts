/** AI 配置：持久化在 server SQLite（/api/ai-settings），浏览器侧内存缓存 */

import { devDebug } from "../lib/devDebug";

import { apiTransport } from "./apiTransport";

export interface AIConfig {
  endpoint: string;
  apiKey: string;
  textToDiagramModel: string;
  diagramToCodeModel: string;
  iconTagModel: string;
}

export interface MindMapAIConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

export interface AISettingsConfig {
  excalidraw: AIConfig;
  mindmap: MindMapAIConfig;
}

export const DEFAULT_EXCALIDRAW_AI_CONFIG: AIConfig = {
  endpoint: "",
  apiKey: "",
  textToDiagramModel: "",
  diagramToCodeModel: "",
  iconTagModel: "",
};

export const DEFAULT_MINDMAP_AI_CONFIG: MindMapAIConfig = {
  endpoint: "",
  apiKey: "",
  model: "",
};

const DEFAULT_CONFIG: AISettingsConfig = {
  excalidraw: DEFAULT_EXCALIDRAW_AI_CONFIG,
  mindmap: DEFAULT_MINDMAP_AI_CONFIG,
};

function normalizeExcalidrawConfig(parsed: Record<string, unknown>): AIConfig {
  const legacyModel =
    typeof parsed.model === "string" ? parsed.model.trim() : "";
  const endpoint = typeof parsed.endpoint === "string" ? parsed.endpoint : "";
  const apiKey = typeof parsed.apiKey === "string" ? parsed.apiKey : "";
  const textToDiagramModel =
    typeof parsed.textToDiagramModel === "string"
      ? parsed.textToDiagramModel.trim()
      : "";
  const diagramToCodeModel =
    typeof parsed.diagramToCodeModel === "string"
      ? parsed.diagramToCodeModel.trim()
      : "";
  const iconTagModel =
    typeof parsed.iconTagModel === "string"
      ? parsed.iconTagModel.trim()
      : "";
  return {
    endpoint,
    apiKey,
    textToDiagramModel: textToDiagramModel || legacyModel,
    diagramToCodeModel: diagramToCodeModel || legacyModel,
    iconTagModel,
  };
}

function normalizeMindMapConfig(
  parsed: Record<string, unknown>,
  fallback?: AIConfig,
): MindMapAIConfig {
  const endpoint = typeof parsed.endpoint === "string" ? parsed.endpoint : "";
  const apiKey = typeof parsed.apiKey === "string" ? parsed.apiKey : "";
  const model = typeof parsed.model === "string" ? parsed.model.trim() : "";
  return {
    endpoint: endpoint || fallback?.endpoint || "",
    apiKey: apiKey || fallback?.apiKey || "",
    model:
      model ||
      fallback?.textToDiagramModel ||
      fallback?.diagramToCodeModel ||
      "gpt-4o",
  };
}

export function normalizeAIConfig(data: unknown): AISettingsConfig {
  if (!data || typeof data !== "object") {
    return {
      excalidraw: { ...DEFAULT_EXCALIDRAW_AI_CONFIG },
      mindmap: { ...DEFAULT_MINDMAP_AI_CONFIG },
    };
  }
  const parsed = data as Record<string, unknown>;
  const rawExcalidraw =
    parsed.excalidraw && typeof parsed.excalidraw === "object"
      ? (parsed.excalidraw as Record<string, unknown>)
      : parsed;
  const excalidraw = normalizeExcalidrawConfig(rawExcalidraw);
  const rawMindMap =
    parsed.mindmap && typeof parsed.mindmap === "object"
      ? (parsed.mindmap as Record<string, unknown>)
      : {};
  return {
    excalidraw,
    mindmap: normalizeMindMapConfig(rawMindMap, excalidraw),
  };
}

export function resolveAIModels(cfg: AIConfig): {
  textToDiagram: string;
  diagramToCode: string;
  iconTag: string;
} {
  const t = cfg.textToDiagramModel.trim();
  const d = cfg.diagramToCodeModel.trim();
  const i = cfg.iconTagModel.trim();
  return {
    textToDiagram: t || d || "gpt-4o",
    diagramToCode: d || t || "gpt-4o",
    iconTag: i || d || t || "gpt-4o",
  };
}

export function resolveMindMapAIEndpoint(endpoint: string): string {
  const trimmedEndpoint = endpoint.trim().replace(/\/+$/, "");
  if (!trimmedEndpoint) {
    return "";
  }
  return trimmedEndpoint.includes("/chat/completions")
    ? trimmedEndpoint
    : `${trimmedEndpoint}/chat/completions`;
}

let cache: AISettingsConfig = normalizeAIConfig(DEFAULT_CONFIG);
let loadedOnce = false;
let inFlight: Promise<AISettingsConfig> | null = null;

const listeners = new Set<() => void>();

export function subscribeAIConfig(listener: () => void): () => void {
  listeners.add(listener);
  devDebug("ai-config", "subscribeAIConfig add listener", {
    listenerCount: listeners.size,
    loadedOnce,
  });
  return () => {
    listeners.delete(listener);
    devDebug("ai-config", "subscribeAIConfig remove listener", {
      listenerCount: listeners.size,
      loadedOnce,
    });
  };
}

function notify() {
  devDebug("ai-config", "notify listeners", {
    listenerCount: listeners.size,
    loadedOnce,
  });
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore
    }
  });
}

function parseResponseJson(data: unknown): AISettingsConfig {
  devDebug("ai-config", "parseResponseJson raw shape", {
    dataType: data === null ? "null" : typeof data,
    topLevelKeys:
      data && typeof data === "object" ? Object.keys(data).sort() : [],
    hasMindMapObject: !!(
      data &&
      typeof data === "object" &&
      (data as Record<string, unknown>).mindmap &&
      typeof (data as Record<string, unknown>).mindmap === "object"
    ),
    hasExcalidrawObject: !!(
      data &&
      typeof data === "object" &&
      (data as Record<string, unknown>).excalidraw &&
      typeof (data as Record<string, unknown>).excalidraw === "object"
    ),
  });
  const config = normalizeAIConfig(data);
  debugAIConfig("parseResponseJson normalized", config);
  return config;
}

function debugAIConfig(label: string, config: AISettingsConfig): void {
  devDebug("ai-config", label, {
    loadedOnce,
    listenerCount: listeners.size,
    excalidraw: {
      hasEndpoint: !!config.excalidraw.endpoint?.trim(),
      endpointLen: config.excalidraw.endpoint?.length ?? 0,
      endpointTail: config.excalidraw.endpoint
        ? config.excalidraw.endpoint.slice(-32)
        : "",
      hasApiKey: !!config.excalidraw.apiKey?.trim(),
      apiKeyLen: config.excalidraw.apiKey?.length ?? 0,
    },
    mindmap: {
      hasEndpoint: !!config.mindmap.endpoint?.trim(),
      endpointLen: config.mindmap.endpoint?.length ?? 0,
      endpointTail: config.mindmap.endpoint
        ? config.mindmap.endpoint.slice(-32)
        : "",
      hasApiKey: !!config.mindmap.apiKey?.trim(),
      apiKeyLen: config.mindmap.apiKey?.length ?? 0,
      model: config.mindmap.model,
      modelLen: config.mindmap.model?.length ?? 0,
      configured: !!(
        config.mindmap.endpoint?.trim() && config.mindmap.apiKey?.trim()
      ),
    },
  });
}

/** 首次进入应用时调用：拉取服务端配置 */
export async function ensureAIConfigLoaded(): Promise<AISettingsConfig> {
  if (loadedOnce) {
    debugAIConfig("ensureAIConfigLoaded:cache", cache);
    return cache;
  }
  if (inFlight) {
    devDebug("ai-config", "ensureAIConfigLoaded reuse inFlight");
    return inFlight;
  }
  inFlight = (async () => {
    devDebug("ai-config", "ensureAIConfigLoaded GET start");
    const res = await apiTransport.request({
      method: "GET",
      path: "/api/ai-settings",
      headers: { Accept: "application/json" },
    });
    devDebug("ai-config", "ensureAIConfigLoaded GET response", {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`AI 配置加载失败: ${res.status}`);
    }
    const cfg = parseResponseJson(JSON.parse(res.bodyText));
    cache = cfg;
    loadedOnce = true;
    debugAIConfig("ensureAIConfigLoaded:loaded", cache);
    notify();
    return cache;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

/** 打开设置页时刷新，避免其它会话已改写 */
export async function refetchAIConfig(): Promise<AISettingsConfig> {
  devDebug("ai-config", "refetchAIConfig GET start");
  const res = await apiTransport.request({
    method: "GET",
    path: "/api/ai-settings",
    headers: { Accept: "application/json" },
  });
  devDebug("ai-config", "refetchAIConfig GET response", {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`AI 配置加载失败: ${res.status}`);
  }
  const cfg = parseResponseJson(JSON.parse(res.bodyText));
  cache = cfg;
  loadedOnce = true;
  debugAIConfig("refetchAIConfig:loaded", cache);
  notify();
  return cfg;
}

export async function saveAIConfigToServer(
  config: AISettingsConfig,
): Promise<AISettingsConfig> {
  debugAIConfig("saveAIConfigToServer:before", config);
  const res = await apiTransport.request({
    method: "PUT",
    path: "/api/ai-settings",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(config),
  });
  devDebug("ai-config", "saveAIConfigToServer PUT response", {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
  });
  if (res.status < 200 || res.status >= 300) {
    const text = res.bodyText;
    throw new Error(text || `保存失败: ${res.status}`);
  }
  const saved = parseResponseJson(JSON.parse(res.bodyText));
  cache = saved;
  loadedOnce = true;
  debugAIConfig("saveAIConfigToServer:after", cache);
  notify();
  return saved;
}

/** 同步读取当前缓存（须先 await ensureAIConfigLoaded，否则可能仍是空） */
export function getCachedAIConfig(): AISettingsConfig {
  return cache;
}

export function isAIConfigured(): boolean {
  const c = cache.excalidraw;
  return !!(c.endpoint?.trim() && c.apiKey?.trim());
}

export function isMindMapAIConfigured(): boolean {
  const c = cache.mindmap;
  return !!(c.endpoint?.trim() && c.apiKey?.trim());
}
