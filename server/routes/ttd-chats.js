import { Router } from "express";
import db from "../db.js";

const router = Router();

const MAX_CHATS_SIZE = 5 * 1024 * 1024; // 5MB

router.get("/", (_req, res) => {
  try {
    const row = db
      .prepare("SELECT chats_json FROM ttd_chats WHERE id = 1")
      .get();
    if (!row?.chats_json) {
      return res.json([]);
    }
    return res.json(JSON.parse(row.chats_json));
  } catch (e) {
    console.error("[ttd-chats] GET", e);
    return res.status(500).json({ error: "failed to read ttd chats" });
  }
});

router.put("/", (req, res) => {
  try {
    const chats = req.body;
    if (!Array.isArray(chats)) {
      return res.status(400).json({ error: "body must be an array" });
    }
    const json = JSON.stringify(chats);
    if (json.length > MAX_CHATS_SIZE) {
      return res.status(413).json({ error: "chats payload too large" });
    }
    db.prepare(
      `INSERT INTO ttd_chats (id, chats_json, updated_at) VALUES (1, @json, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET chats_json = excluded.chats_json, updated_at = excluded.updated_at`,
    ).run({ json });
    return res.json({ ok: true });
  } catch (e) {
    console.error("[ttd-chats] PUT", e);
    return res.status(500).json({ error: "failed to save ttd chats" });
  }
});

export default router;
