/** Shared AI settings normalization for API routes. */

export function emptyConfig() {
  return {
    excalidraw: {
      endpoint: "",
      apiKey: "",
      textToDiagramModel: "",
      diagramToCodeModel: "",
      iconTagModel: "",
    },
    mindmap: {
      endpoint: "",
      apiKey: "",
      model: "",
    },
  };
}

function sanitizeExcalidrawConfig(data = {}) {
  return {
    endpoint: typeof data.endpoint === "string" ? data.endpoint : "",
    apiKey: typeof data.apiKey === "string" ? data.apiKey : "",
    textToDiagramModel:
      typeof data.textToDiagramModel === "string" ? data.textToDiagramModel : "",
    diagramToCodeModel:
      typeof data.diagramToCodeModel === "string" ? data.diagramToCodeModel : "",
    iconTagModel: typeof data.iconTagModel === "string" ? data.iconTagModel : "",
  };
}

function sanitizeMindMapConfig(data = {}, fallback = {}) {
  return {
    endpoint:
      typeof data.endpoint === "string" ? data.endpoint : fallback.endpoint || "",
    apiKey: typeof data.apiKey === "string" ? data.apiKey : fallback.apiKey || "",
    model:
      typeof data.model === "string"
        ? data.model
        : fallback.textToDiagramModel || fallback.diagramToCodeModel || "gpt-4o",
  };
}

export function normalizeConfig(data) {
  const body = data && typeof data === "object" ? data : {};
  const rawExcalidraw =
    body.excalidraw && typeof body.excalidraw === "object"
      ? body.excalidraw
      : body;
  const excalidraw = sanitizeExcalidrawConfig(rawExcalidraw);
  const rawMindMap =
    body.mindmap && typeof body.mindmap === "object" ? body.mindmap : {};
  return {
    excalidraw,
    mindmap: sanitizeMindMapConfig(rawMindMap, excalidraw),
  };
}

export function readAISettingsConfig(db) {
  const row = db.prepare("SELECT config_json FROM ai_settings WHERE id = 1").get();
  if (!row?.config_json) {
    return emptyConfig();
  }
  return normalizeConfig(JSON.parse(row.config_json));
}

export function summarizeConfig(config) {
  return {
    excalidraw: {
      hasEndpoint: !!config.excalidraw.endpoint?.trim(),
      endpointLen: config.excalidraw.endpoint?.length || 0,
      endpointTail: config.excalidraw.endpoint
        ? config.excalidraw.endpoint.slice(-32)
        : "",
      hasApiKey: !!config.excalidraw.apiKey?.trim(),
      apiKeyLen: config.excalidraw.apiKey?.length || 0,
    },
    mindmap: {
      hasEndpoint: !!config.mindmap.endpoint?.trim(),
      endpointLen: config.mindmap.endpoint?.length || 0,
      endpointTail: config.mindmap.endpoint
        ? config.mindmap.endpoint.slice(-32)
        : "",
      hasApiKey: !!config.mindmap.apiKey?.trim(),
      apiKeyLen: config.mindmap.apiKey?.length || 0,
      model: config.mindmap.model,
      modelLen: config.mindmap.model?.length || 0,
      configured: isMindMapAIConfigured(config),
    },
  };
}

export function isMindMapAIConfigured(config) {
  return !!(
    config?.mindmap?.endpoint?.trim() &&
    config?.mindmap?.apiKey?.trim()
  );
}

export function resolveMindMapAIEndpoint(endpoint) {
  const trimmedEndpoint = String(endpoint || "").trim().replace(/\/+$/, "");
  if (!trimmedEndpoint) {
    return "";
  }
  return trimmedEndpoint.includes("/chat/completions")
    ? trimmedEndpoint
    : `${trimmedEndpoint}/chat/completions`;
}
