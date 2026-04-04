/** AI 配置：持久化在 server SQLite（/api/ai-settings），浏览器侧内存缓存 */

export interface AIConfig {
  endpoint: string;
  apiKey: string;
  textToDiagramModel: string;
  diagramToCodeModel: string;
  iconTagModel: string;
}

const DEFAULT_CONFIG: AIConfig = {
  endpoint: "",
  apiKey: "",
  textToDiagramModel: "",
  diagramToCodeModel: "",
  iconTagModel: "",
};

function migrateRawConfig(parsed: Record<string, unknown>): AIConfig {
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

let cache: AIConfig = { ...DEFAULT_CONFIG };
let loadedOnce = false;
let inFlight: Promise<AIConfig> | null = null;

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

function parseResponseJson(data: unknown): AIConfig {
  if (!data || typeof data !== "object") {
    return { ...DEFAULT_CONFIG };
  }
  return migrateRawConfig(data as Record<string, unknown>);
}

/** 首次进入应用时调用：拉取服务端配置 */
export async function ensureAIConfigLoaded(): Promise<AIConfig> {
  if (loadedOnce) {
    return cache;
  }
  if (inFlight) {
    return inFlight;
  }
  inFlight = (async () => {
    const res = await fetch("/api/ai-settings");
    if (!res.ok) {
      throw new Error(`AI 配置加载失败: ${res.status}`);
    }
    const cfg = parseResponseJson(await res.json());
    cache = cfg;
    loadedOnce = true;
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
export async function refetchAIConfig(): Promise<AIConfig> {
  const res = await fetch("/api/ai-settings");
  if (!res.ok) {
    throw new Error(`AI 配置加载失败: ${res.status}`);
  }
  const cfg = parseResponseJson(await res.json());
  cache = cfg;
  loadedOnce = true;
  notify();
  return cfg;
}

export async function saveAIConfigToServer(config: AIConfig): Promise<AIConfig> {
  const res = await fetch("/api/ai-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `保存失败: ${res.status}`);
  }
  const saved = parseResponseJson(await res.json());
  cache = saved;
  loadedOnce = true;
  notify();
  return saved;
}

/** 同步读取当前缓存（须先 await ensureAIConfigLoaded，否则可能仍是空） */
export function getCachedAIConfig(): AIConfig {
  return cache;
}

export function isAIConfigured(): boolean {
  const c = cache;
  return !!(c.endpoint?.trim() && c.apiKey?.trim());
}
