import { Router } from "express";
import db from "../db.js";

const router = Router();

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

function normalizeConfig(value) {
  const body = value && typeof value === "object" ? value : {};
  const excalidraw = body.excalidraw && typeof body.excalidraw === "object"
    ? body.excalidraw
    : body;
  const mindmap = body.mindmap && typeof body.mindmap === "object"
    ? body.mindmap
    : {};
  return {
    excalidraw: {
      endpoint: typeof excalidraw.endpoint === "string" ? excalidraw.endpoint : "",
      apiKey: typeof excalidraw.apiKey === "string" ? excalidraw.apiKey : "",
      textToDiagramModel: typeof excalidraw.textToDiagramModel === "string" ? excalidraw.textToDiagramModel : "",
      diagramToCodeModel: typeof excalidraw.diagramToCodeModel === "string" ? excalidraw.diagramToCodeModel : "",
      iconTagModel: typeof excalidraw.iconTagModel === "string" ? excalidraw.iconTagModel : "",
    },
    mindmap: {
      endpoint: typeof mindmap.endpoint === "string" ? mindmap.endpoint : "",
      apiKey: typeof mindmap.apiKey === "string" ? mindmap.apiKey : "",
      model: typeof mindmap.model === "string" ? mindmap.model : "",
    },
  };
}

router.get("/", (_req, res) => {
  const row = db.prepare("SELECT config_json FROM ai_settings WHERE id = 1").get();
  if (!row?.config_json) {
    return res.json(emptyConfig());
  }
  try {
    return res.json(normalizeConfig(JSON.parse(row.config_json)));
  } catch {
    return res.json(emptyConfig());
  }
});

router.put("/", (req, res) => {
  const config = normalizeConfig(req.body);
  db.prepare(`
    INSERT INTO ai_settings (id, config_json)
    VALUES (1, @json)
    ON CONFLICT(id) DO UPDATE SET config_json = excluded.config_json
  `).run({ json: JSON.stringify(config) });
  res.json(config);
});

export default router;
