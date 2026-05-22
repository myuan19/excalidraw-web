import { Router } from "express";
import db from "../db.js";

const router = Router();
const MAX_CHATS_BYTES = 5 * 1024 * 1024;

router.get("/", (_req, res) => {
  const row = db.prepare("SELECT chats_json FROM ttd_chats WHERE id = 1").get();
  res.json(row?.chats_json ? JSON.parse(row.chats_json) : []);
});

router.put("/", (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ error: "body must be an array" });
  }
  const json = JSON.stringify(req.body);
  if (Buffer.byteLength(json, "utf8") > MAX_CHATS_BYTES) {
    return res.status(413).json({ error: "payload_too_large" });
  }
  db.prepare(`
    INSERT INTO ttd_chats (id, chats_json, updated_at)
    VALUES (1, @json, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET chats_json = excluded.chats_json, updated_at = excluded.updated_at
  `).run({ json });
  res.json({ ok: true });
});

export default router;
