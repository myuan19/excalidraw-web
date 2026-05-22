import { Router } from "express";
import { createLogger } from "../lib/logger.js";

const router = Router();
const log = createLogger({ module: "client" });
const INGEST_ENABLED = !["0", "false", "off"].includes(
  String(process.env.LOG_CLIENT_INGEST ?? process.env.EXCALIDRAW_CLIENT_LOG ?? "1").toLowerCase(),
);

function truncate(value, max = 2000) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function sanitizeData(value) {
  if (value == null) return undefined;
  if (typeof value === "string") return { value: truncate(value, 4000) };
  try {
    return JSON.parse(truncate(value, 4000));
  } catch {
    return { value: truncate(String(value), 4000) };
  }
}

router.post("/", (req, res) => {
  if (!INGEST_ENABLED) {
    return res.status(204).send();
  }
  const entries = Array.isArray(req.body?.entries) ? req.body.entries.slice(0, 100) : [];
  for (const entry of entries) {
    if (!entry || typeof entry.msg !== "string") continue;
    const level = entry.level === "error" ? "error" : entry.level === "warn" ? "warn" : "info";
    log[level](truncate(entry.msg, 1000), sanitizeData(entry.data));
  }
  res.status(204).send();
});

export default router;
