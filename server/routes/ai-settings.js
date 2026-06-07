import { Router } from "express";
import db from "../db.js";

const router = Router();

/** 默认空配置（未设置过） */
function emptyConfig() {
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
        : fallback.textToDiagramModel || fallback.diagramToCodeModel || "",
  };
}

function normalizeConfig(data) {
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

function summarizeConfig(config) {
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
      configured: !!(
        config.mindmap.endpoint?.trim() && config.mindmap.apiKey?.trim()
      ),
    },
  };
}

/**
 * GET /api/ai-settings
 * PUT /api/ai-settings
 *
 * 注意：当前 server 无鉴权，任意能访问 API 的客户端均可读写密钥。
 * 生产环境请置于内网或网关后并加认证。
 */
router.get("/", (_req, res) => {
  try {
    const row = db
      .prepare("SELECT config_json FROM ai_settings WHERE id = 1")
      .get();
    console.log("[DEBUG] ai-settings GET | db row", {
      hasRow: !!row,
      configJsonLen: row?.config_json?.length || 0,
    });
    if (!row?.config_json) {
      const config = emptyConfig();
      console.log("[DEBUG] ai-settings GET | empty config", summarizeConfig(config));
      return res.json(config);
    }
    const parsed = JSON.parse(row.config_json);
    const config = normalizeConfig(parsed);
    console.log("[DEBUG] ai-settings GET | normalized config", summarizeConfig(config));
    return res.json(config);
  } catch (e) {
    console.error("[ai-settings] GET", e);
    return res.status(500).json({ error: "failed to read ai settings" });
  }
});

router.put("/", (req, res) => {
  try {
    console.log("[DEBUG] ai-settings PUT | raw body shape", {
      bodyType: req.body === null ? "null" : typeof req.body,
      topLevelKeys:
        req.body && typeof req.body === "object"
          ? Object.keys(req.body).sort()
          : [],
      hasMindMapObject: !!(
        req.body &&
        typeof req.body === "object" &&
        req.body.mindmap &&
        typeof req.body.mindmap === "object"
      ),
      hasExcalidrawObject: !!(
        req.body &&
        typeof req.body === "object" &&
        req.body.excalidraw &&
        typeof req.body.excalidraw === "object"
      ),
    });
    const config = normalizeConfig(req.body);
    console.log("[DEBUG] ai-settings PUT | normalized config", summarizeConfig(config));
    db.prepare(
      `INSERT INTO ai_settings (id, config_json) VALUES (1, @json)
       ON CONFLICT(id) DO UPDATE SET config_json = excluded.config_json`,
    ).run({ json: JSON.stringify(config) });
    return res.json(config);
  } catch (e) {
    console.error("[ai-settings] PUT", e);
    return res.status(500).json({ error: "failed to save ai settings" });
  }
});

export default router;
