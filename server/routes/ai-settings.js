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
    if (!row?.config_json) {
      return res.json(emptyConfig());
    }
    const parsed = JSON.parse(row.config_json);
    return res.json(normalizeConfig(parsed));
  } catch (e) {
    console.error("[ai-settings] GET", e);
    return res.status(500).json({ error: "failed to read ai settings" });
  }
});

router.put("/", (req, res) => {
  try {
    const config = normalizeConfig(req.body);
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
