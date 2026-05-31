/** AI 配置：持久化在 server SQLite（/api/ai-settings），浏览器侧内存缓存 */

import { devDebug } from "../lib/devDebug";

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
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore
    }
  });
}

function parseResponseJson(data: unknown): AISettingsConfig {
  return normalizeAIConfig(data);
}

function debugAIConfig(label: string, config: AISettingsConfig): void {
  devDebug("ai-config", label, {
    excalidraw: {
      hasEndpoint: !!config.excalidraw.endpoint?.trim(),
      hasApiKey: !!config.excalidraw.apiKey?.trim(),
    },
    mindmap: {
      hasEndpoint: !!config.mindmap.endpoint?.trim(),
      hasApiKey: !!config.mindmap.apiKey?.trim(),
      model: config.mindmap.model,
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
    const res = await fetch("/api/ai-settings");
    devDebug("ai-config", "ensureAIConfigLoaded GET response", {
      ok: res.ok,
      status: res.status,
    });
    if (!res.ok) {
      throw new Error(`AI 配置加载失败: ${res.status}`);
    }
    const cfg = parseResponseJson(await res.json());
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
  const res = await fetch("/api/ai-settings");
  devDebug("ai-config", "refetchAIConfig GET response", {
    ok: res.ok,
    status: res.status,
  });
  if (!res.ok) {
    throw new Error(`AI 配置加载失败: ${res.status}`);
  }
  const cfg = parseResponseJson(await res.json());
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
  const res = await fetch("/api/ai-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  devDebug("ai-config", "saveAIConfigToServer PUT response", {
    ok: res.ok,
    status: res.status,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `保存失败: ${res.status}`);
  }
  const saved = parseResponseJson(await res.json());
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
