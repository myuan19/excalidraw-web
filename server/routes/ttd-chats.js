import { Router } from "express";
import db from "../db.js";
import { createLogger } from "../lib/logger.js";

const router = Router();
const log = createLogger({ module: "ttd-chats" });

const MAX_CHATS_SIZE = 5 * 1024 * 1024; // 5MB

router.get("/", (_req, res) => {
  log.info("GET /api/ttd-chats");
  try {
    const row = db
      .prepare("SELECT chats_json FROM ttd_chats WHERE id = 1")
      .get();
    const hasRow = !!row?.chats_json;
    log.debug("DB query result", { hasRow, jsonLength: row?.chats_json?.length ?? 0 });
    if (!hasRow) {
      log.info("GET → returning empty array (no row)");
      return res.json([]);
    }
    const parsed = JSON.parse(row.chats_json);
    log.info("GET → returning chats", { count: Array.isArray(parsed) ? parsed.length : "not-array" });
    return res.json(parsed);
  } catch (e) {
    log.error("GET failed", { error: e.message, stack: e.stack?.split("\n").slice(0, 3).join("\n") });
    return res.status(500).json({ error: "failed to read ttd chats" });
  }
});

router.put("/", (req, res) => {
  log.info("PUT /api/ttd-chats");
  try {
    const chats = req.body;
    const isArray = Array.isArray(chats);
    log.debug("PUT body check", { isArray, count: isArray ? chats.length : 0 });
    if (!isArray) {
      log.warn("PUT rejected: body is not an array", { bodyType: typeof chats });
      return res.status(400).json({ error: "body must be an array" });
    }
    const json = JSON.stringify(chats);
    log.debug("PUT serialized", { jsonBytes: json.length });
    if (json.length > MAX_CHATS_SIZE) {
      log.warn("PUT rejected: payload too large", { jsonBytes: json.length, max: MAX_CHATS_SIZE });
      return res.status(413).json({ error: "chats payload too large" });
    }
    db.prepare(
      `INSERT INTO ttd_chats (id, chats_json, updated_at) VALUES (1, @json, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET chats_json = excluded.chats_json, updated_at = excluded.updated_at`,
    ).run({ json });
    log.info("PUT → saved successfully", { chatCount: chats.length, jsonBytes: json.length });
    return res.json({ ok: true });
  } catch (e) {
    log.error("PUT failed", { error: e.message, stack: e.stack?.split("\n").slice(0, 3).join("\n") });
    return res.status(500).json({ error: "failed to save ttd chats" });
  }
});

export default router;
