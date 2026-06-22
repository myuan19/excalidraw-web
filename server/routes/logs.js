/**
 * POST /api/logs — batched browser log entries → stdout + _dev_data/logs/client.log
 * Disable: LOG_CLIENT_INGEST=0 or EXCALIDRAW_CLIENT_LOG=0
 */
import express from "express";
import { sanitizeLogRecord } from "../../lib/logger/core.js";
import { createLogger, _transports } from "../lib/logger.js";
import {
  isClientLogIngestEnabled,
  isDebugLogAllowed,
  truncStr,
} from "../logger.js";

const router = express.Router();
const log = createLogger({ module: "ingest" });

function logCollectorEvent(level, event, message, fields) {
  log.event(level, `collector.ingest.${event}`, message, { fields });
}

const VALID_LEVELS = new Set([
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "critical",
]);
const MAX_ENTRIES_PER_BATCH = 100;
const MAX_MSG_LEN = 4000;
const MAX_DATA_LEN = 2048;
const MAX_EVENT_LEN = 120;
const MAX_CONTEXT_VALUE_LEN = 120;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_BATCHES = 60;
const RATE_LIMIT_MAX_BATCHES_DEBUG = 300;

const rateBuckets = new Map();

function rateLimitKey(req) {
  return req.ip || req.headers["x-forwarded-for"] || "unknown";
}

function isRateLimited(req, debugMode) {
  const maxBatches = debugMode
    ? RATE_LIMIT_MAX_BATCHES_DEBUG
    : RATE_LIMIT_MAX_BATCHES;
  const now = Date.now();
  const key = rateLimitKey(req);
  const current = rateBuckets.get(key);
  if (!current || now - current.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(key, { windowStart: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > maxBatches;
}

function sanitizeData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  return sanitizeLogRecord(data, { maxStringLength: MAX_DATA_LEN });
}

function sanitizeContext(context) {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return undefined;
  }
  const sanitized = sanitizeLogRecord(context, {
    maxStringLength: MAX_CONTEXT_VALUE_LEN,
  });
  const out = {};
  for (const [key, value] of Object.entries(sanitized ?? {})) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      out[key] = value;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

router.post("/", (req, res) => {
  const debugMode = req.body?.debugMode === true;
  if (!isDebugLogAllowed() || !debugMode || !isClientLogIngestEnabled()) {
    return res.status(204).send();
  }
  if (isRateLimited(req, debugMode)) {
    logCollectorEvent("warn", "rate_limited", "batch rate limited", {
      ip: req.ip,
      debugMode,
    });
    return res.status(429).json({ error: "log ingest rate limited" });
  }

  const { entries } = req.body;
  if (!Array.isArray(entries)) {
    return res.status(400).json({ error: "entries array required" });
  }

  const dropped = Math.max(0, entries.length - MAX_ENTRIES_PER_BATCH);
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
      component:
        typeof raw.component === "string" ? raw.component.slice(0, 16) : "FE",
      module: typeof raw.module === "string" ? raw.module.slice(0, 64) : "unknown",
      event:
        typeof raw.event === "string"
          ? truncStr(raw.event, MAX_EVENT_LEN)
          : undefined,
      msg: truncStr(raw.msg, MAX_MSG_LEN),
    };

    const data = sanitizeData(raw.data);
    if (data) entry.data = data;
    const fields = sanitizeData(raw.fields);
    if (fields) entry.fields = fields;
    const context = sanitizeContext(raw.context);
    if (context) entry.context = context;
    if (typeof raw.sourceLocation === "string") {
      entry.sourceLocation = truncStr(raw.sourceLocation, 160);
    }
    if (typeof raw.sequence === "number" && Number.isFinite(raw.sequence)) {
      entry.sequence = raw.sequence;
    }
    if (typeof raw.sid === "string") entry.sid = raw.sid.slice(0, 48);
    if (typeof raw.ua === "string") entry.ua = truncStr(raw.ua, 120);
    entry.fields = {
      ...(entry.data ?? {}),
      ...(entry.fields ?? {}),
      ...(debugMode ? { debugMode: true } : {}),
    };

    for (const t of _transports) {
      try { t.write(entry); } catch { /* */ }
    }
    written++;
  }

  logCollectorEvent("debug", "batch_ingested", "batch ingested", {
    received: batch.length,
    dropped,
    written,
    ip: req.ip,
    debugMode,
  });

  return res.status(204).send();
});

export default router;
