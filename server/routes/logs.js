/**
 * POST /api/logs — batched browser log entries → stdout + _dev_data/logs/client.log
 * Disable: LOG_CLIENT_INGEST=0 or EXCALIDRAW_CLIENT_LOG=0
 */
import express from "express";
import { createLogger, _transports } from "../lib/logger.js";
import { isClientLogIngestEnabled, truncStr } from "../logger.js";

const router = express.Router();
const log = createLogger({ module: "ingest" });

const VALID_LEVELS = new Set(["debug", "info", "warn", "error"]);
const MAX_ENTRIES_PER_BATCH = 100;
const MAX_MSG_LEN = 4000;
const MAX_DATA_LEN = 2048;

function sanitizeData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === "string") {
      out[k] = truncStr(v, MAX_DATA_LEN);
    } else if (typeof v === "number" || typeof v === "boolean" || v === null) {
      out[k] = v;
    } else {
      try {
        out[k] = truncStr(JSON.stringify(v), MAX_DATA_LEN);
      } catch {
        out[k] = "[unserializable]";
      }
    }
  }
  return out;
}

router.post("/", (req, res) => {
  if (!isClientLogIngestEnabled()) {
    return res.status(204).send();
  }

  const { entries } = req.body;
  if (!Array.isArray(entries)) {
    return res.status(400).json({ error: "entries array required" });
  }

  const batch = entries
    .slice(0, MAX_ENTRIES_PER_BATCH)
    .filter((raw) => raw && typeof raw === "object")
    .sort((a, b) =>
      String(typeof a.ts === "string" ? a.ts : "").localeCompare(
        String(typeof b.ts === "string" ? b.ts : ""),
      ),
    );
  let written = 0;

  for (const raw of batch) {
    if (!raw.msg || typeof raw.msg !== "string") continue;

    const entry = {
      ts: typeof raw.ts === "string" ? raw.ts.slice(0, 64) : new Date().toISOString(),
      level: VALID_LEVELS.has(raw.level) ? raw.level : "info",
      source: "client",
      module: typeof raw.module === "string" ? raw.module.slice(0, 64) : "unknown",
      msg: truncStr(raw.msg, MAX_MSG_LEN),
    };

    const data = sanitizeData(raw.data);
    if (data) entry.data = data;
    if (typeof raw.sid === "string") entry.sid = raw.sid.slice(0, 48);
    if (typeof raw.ua === "string") entry.ua = truncStr(raw.ua, 120);

    for (const t of _transports) {
      try { t.write(entry); } catch { /* */ }
    }
    written++;
  }

  log.debug("batch ingested", {
    received: batch.length,
    written,
    ip: req.ip,
  });

  return res.status(204).send();
});

export default router;
