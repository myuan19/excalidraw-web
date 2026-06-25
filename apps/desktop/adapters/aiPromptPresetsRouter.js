import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { Router } from "express";

function resolveStorePath() {
  const dataDir = process.env.EXCALIDRAW_DATA_DIR;
  if (!dataDir) {
    throw new Error("EXCALIDRAW_DATA_DIR is not set");
  }
  fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, "ai-prompt-presets.json");
}

function normalizeArea(value) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : "mindmap-organize";
}

function normalizeOptions(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function readPresets() {
  try {
    const storePath = resolveStorePath();
    if (!fs.existsSync(storePath)) {
      return [];
    }
    const parsed = JSON.parse(fs.readFileSync(storePath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePresets(presets) {
  fs.writeFileSync(
    resolveStorePath(),
    `${JSON.stringify(presets, null, 2)}\n`,
    "utf8",
  );
}

function sortPresets(a, b) {
  const sortDiff = (a.sort_index ?? 0) - (b.sort_index ?? 0);
  if (sortDiff !== 0) {
    return sortDiff;
  }
  return String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""));
}

/** Desktop 本地 AI 提示词预设：JSON 文件持久化，不依赖 better-sqlite3。 */
export function createDesktopAiPromptPresetsRouter() {
  const router = Router();

  router.get("/", (_req, res) => {
    try {
      const area = normalizeArea(_req.query.area);
      const rows = readPresets()
        .filter((row) => normalizeArea(row?.area) === area)
        .sort(sortPresets);
      return res.json(rows);
    } catch (error) {
      return res.status(500).json({
        error: "failed to read prompt presets",
        message: error instanceof Error ? error.message : String(error),
      });
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
      const now = new Date().toISOString();
      const next = {
        id,
        area,
        name,
        prompt,
        options: normalizeOptions(req.body?.options),
        created_at: now,
        updated_at: now,
        sort_index: Number(req.body?.sort_index) || 0,
      };
      const presets = readPresets();
      const index = presets.findIndex((row) => row?.id === id);
      if (index >= 0) {
        next.created_at = presets[index]?.created_at ?? now;
        presets[index] = next;
      } else {
        presets.push(next);
      }
      writePresets(presets);
      return res.status(201).json(next);
    } catch (error) {
      return res.status(500).json({
        error: "failed to save prompt preset",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.delete("/:id", (req, res) => {
    try {
      const presets = readPresets();
      const next = presets.filter((row) => row?.id !== req.params.id);
      if (next.length === presets.length) {
        return res.status(404).json({ error: "not_found" });
      }
      writePresets(next);
      return res.json({ ok: true });
    } catch (error) {
      return res.status(500).json({
        error: "failed to delete prompt preset",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
