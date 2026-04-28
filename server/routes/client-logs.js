/**
 * Frontend debug / diagnostic lines →Append to DATA_DIR/logs/client.log，
 * optional echo [excalidraw-api] [client] to stdout for docker logs。
 * 默认开启；关闭：EXCALIDRAW_CLIENT_LOG=0
 */
import express from "express";
import { appendFile, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { promisify } from "util";

import { DATA_DIR } from "../db.js";
import { apiLog, isClientLogIngestEnabled, truncStr } from "../logger.js";

const appendFileAsync = promisify(appendFile);

const router = express.Router();

function enabled() {
  return isClientLogIngestEnabled();
}

function safeSerialize(v, maxLen) {
  try {
    if (v === undefined) {
      return undefined;
    }
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return truncStr(s, maxLen ?? 2048);
  } catch {
    return "[serialize_error]";
  }
}

router.post("/", async (req, res) => {
  if (!enabled()) {
    return res.status(404).json({
      error: "client_log_disabled",
      hint:
        "Ingest disabled (EXCALIDRAW_CLIENT_LOG=0). Omit the variable or set 1/true to enable.",
    });
  }

  const raw = req.body?.entries;
  if (!Array.isArray(raw) || raw.length === 0) {
    return res
      .status(400)
      .json({ error: "bad_request", hint: "`entries` must be a non-empty array" });
  }

  const entries = raw.slice(0, 120);
  const logDir = join(DATA_DIR, "logs");
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
  const logFile = join(logDir, "client.log");
  const ip = req.ip || req.socket?.remoteAddress || "";

  const lines = [];
  for (const e of entries) {
    if (!e || typeof e !== "object") {
      continue;
    }
    const lineObj = {
      ts: typeof e.ts === "string" ? e.ts.slice(0, 64) : new Date().toISOString(),
      level:
        typeof e.level === "string" ? truncStr(e.level, 24) : "info",
      channel:
        typeof e.channel === "string" ? truncStr(e.channel, 80) : "",
      message:
        typeof e.message === "string"
          ? truncStr(e.message, 8000)
          : truncStr(String(e.message ?? ""), 8000),
      args: undefined,
      userAgent:
        typeof e.userAgent === "string"
          ? truncStr(e.userAgent, 360)
          : undefined,
      href:
        typeof e.href === "string" ? truncStr(e.href, 400) : undefined,
      ip,
      context: undefined,
    };
    if (e.context && typeof e.context === "object" && !Array.isArray(e.context)) {
      const c = /** @type {Record<string, unknown>} */ (e.context);
      lineObj.context = {
        sid:
          typeof c.sid === "string" ? truncStr(c.sid, 48) : undefined,
        path:
          typeof c.path === "string" ? truncStr(c.path, 400) : undefined,
        build:
          typeof c.build === "string" ? truncStr(c.build, 80) : undefined,
        visibility:
          typeof c.visibility === "string" ? c.visibility.slice(0, 24) : undefined,
      };
    }
    if (Array.isArray(e.args) && e.args.length > 0) {
      lineObj.args = e.args.slice(0, 20).map((a) => safeSerialize(a, 4096));
    }
    lines.push(JSON.stringify(lineObj));
  }

  if (lines.length === 0) {
    return res.status(400).json({ error: "no_valid_entries" });
  }

  try {
    await appendFileAsync(logFile, `${lines.join("\n")}\n`, "utf8");
  } catch (err) {
    apiLog("client-log", "append failed", { message: String(err.message) });
    return res.status(500).json({ error: "write_failed" });
  }

  const bodyLen = Buffer.byteLength(lines.join("\n"), "utf8");
  const uniqChans = [...new Set(entries.map((x) => x?.channel).filter(Boolean))];
  apiLog(
    "client-ingest",
    `batch entries=${entries.length} lines=${lines.length} ~${bodyLen}b`,
    {
      channels: truncStr(
        uniqChans.slice(0, 24).join(" | "),
        480,
      ),
    },
  );
  const preview = entries.slice(0, 8);
  for (const e of preview) {
    if (e && typeof e.channel === "string" && typeof e.message === "string") {
      apiLog("client", truncStr(`${e.channel} ${e.message}`, 200));
    }
  }
  const firstCtx = entries.find(
    (e) => e?.context && typeof e.context === "object",
  );
  if (firstCtx?.context) {
    const c = /** @type {{ sid?: unknown; path?: unknown }} */ (firstCtx.context);
    apiLog("client-ingest", "context sample → docker stdout", {
      sid: truncStr(String(c.sid ?? ""), 48),
      path: truncStr(String(c.path ?? ""), 200),
    });
  }

  return res.status(204).send();
});

export default router;
