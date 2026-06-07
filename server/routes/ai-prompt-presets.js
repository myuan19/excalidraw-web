import { randomUUID } from "crypto";
import { Router } from "express";

import db from "../db.js";

const router = Router();

function normalizeArea(value) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : "mindmap-organize";
}

function mapRow(row) {
  return {
    id: row.id,
    area: row.area,
    name: row.name,
    prompt: row.prompt,
    created_at: row.created_at,
    updated_at: row.updated_at,
    sort_index: row.sort_index ?? 0,
  };
}

router.get("/", (req, res) => {
  try {
    const area = normalizeArea(req.query.area);
    const rows = db
      .prepare(
        "SELECT id, area, name, prompt, created_at, updated_at, sort_index FROM ai_prompt_presets WHERE area = ? ORDER BY sort_index ASC, updated_at DESC",
      )
      .all(area);
    return res.json(rows.map(mapRow));
  } catch (error) {
    console.error("[ai-prompt-presets] GET", error);
    return res.status(500).json({ error: "failed to read prompt presets" });
  }
});

router.post("/", (req, res) => {
  try {
    const id =
      typeof req.body?.id === "string" && req.body.id.trim()
        ? req.body.id.trim()
        : randomUUID();
    const area = normalizeArea(req.body?.area);
    const name =
      typeof req.body?.name === "string" && req.body.name.trim()
        ? req.body.name.trim()
        : "未命名提示词";
    const prompt =
      typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    if (!prompt) {
      return res.status(400).json({ error: "prompt_required" });
    }
    const sortIndex = Number(req.body?.sort_index) || 0;
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO ai_prompt_presets
       (id, area, name, prompt, created_at, updated_at, sort_index)
       VALUES (@id, @area, @name, @prompt, @now, @now, @sortIndex)
       ON CONFLICT(id) DO UPDATE SET
         area = excluded.area,
         name = excluded.name,
         prompt = excluded.prompt,
         updated_at = excluded.updated_at,
         sort_index = excluded.sort_index`,
    ).run({ id, area, name, prompt, now, sortIndex });
    const row = db
      .prepare(
        "SELECT id, area, name, prompt, created_at, updated_at, sort_index FROM ai_prompt_presets WHERE id = ?",
      )
      .get(id);
    return res.status(201).json(mapRow(row));
  } catch (error) {
    console.error("[ai-prompt-presets] POST", error);
    return res.status(500).json({ error: "failed to save prompt preset" });
  }
});

router.delete("/:id", (req, res) => {
  try {
    const result = db
      .prepare("DELETE FROM ai_prompt_presets WHERE id = ?")
      .run(req.params.id);
    if (result.changes <= 0) {
      return res.status(404).json({ error: "not_found" });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error("[ai-prompt-presets] DELETE", error);
    return res.status(500).json({ error: "failed to delete prompt preset" });
  }
});

export default router;
