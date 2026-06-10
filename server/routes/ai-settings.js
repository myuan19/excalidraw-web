import { Router } from "express";
import db from "../db.js";
import {
  emptyConfig,
  normalizeConfig,
  summarizeConfig,
} from "../lib/aiSettingsConfig.js";

const router = Router();

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
    const config = normalizeConfig(JSON.parse(row.config_json));
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
