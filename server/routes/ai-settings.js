import { Router } from "express";
import db from "../db.js";

const router = Router();

/** 默认空配置（未设置过） */
function emptyConfig() {
  return {
    endpoint: "",
    apiKey: "",
    textToDiagramModel: "",
    diagramToCodeModel: "",
    iconTagModel: "",
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
    return res.json({
      ...emptyConfig(),
      ...parsed,
    });
  } catch (e) {
    console.error("[ai-settings] GET", e);
    return res.status(500).json({ error: "failed to read ai settings" });
  }
});

router.put("/", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const config = {
      endpoint:
        typeof body.endpoint === "string" ? body.endpoint : "",
      apiKey: typeof body.apiKey === "string" ? body.apiKey : "",
      textToDiagramModel:
        typeof body.textToDiagramModel === "string"
          ? body.textToDiagramModel
          : "",
      diagramToCodeModel:
        typeof body.diagramToCodeModel === "string"
          ? body.diagramToCodeModel
          : "",
      iconTagModel:
        typeof body.iconTagModel === "string"
          ? body.iconTagModel
          : "",
    };
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
