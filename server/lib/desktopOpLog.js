/**
 * Desktop 统一操作日志：将浏览器 POST /api/logs 条目写入 desktop-op-<session>.log，
 * 与 main / files / server 类别同文件，便于联调。
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";

import { resolveLogDir } from "../config/logDir.js";
import { createLogSessionId, sessionLogBasename } from "../config/logNaming.js";
import { truncStr } from "../logger.js";

import { parseByteSize, pruneLogFiles } from "./logPrune.js";

const LOG_PREFIX = "desktop-op";
const DESKTOP_OP_SESSION_ID =
  process.env.EDITORHUB_DESKTOP_OP_LOG_SESSION_ID || createLogSessionId();
const LOG_BASENAME = sessionLogBasename(LOG_PREFIX, DESKTOP_OP_SESSION_ID);
const DEFAULT_ROTATE_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 200 * 1024 * 1024;

let currentChunkIndex = 0;

export function isDesktopUnifiedLogEnabled() {
  return process.env.EDITORHUB_DESKTOP === "1";
}

function parseDesktopOpRotateBytes() {
  const parsed = parseByteSize(process.env.LOG_ROTATE_SIZE ?? "10M");
  return parsed > 0 ? parsed : DEFAULT_ROTATE_BYTES;
}

function parseDesktopOpMaxTotalBytes() {
  const parsed = parseByteSize(process.env.LOG_MAX_TOTAL_SIZE ?? "200M");
  return parsed > 0 ? parsed : DEFAULT_MAX_TOTAL_BYTES;
}

function resolveDesktopOpLogDirs() {
  const paths = [];
  const envDir = process.env.EDITORHUB_DESKTOP_LOG_DIR?.trim();
  if (envDir) {
    paths.push(envDir);
  }
  const logDir = resolveLogDir();
  if (logDir) {
    paths.push(logDir);
  }
  return [...new Set(paths)];
}

function basenameForChunk(index) {
  return index === 0 ? LOG_BASENAME : `${LOG_BASENAME}.${index}`;
}

function resolveWritePath(logDir) {
  const rotateBytes = parseDesktopOpRotateBytes();
  let candidate = path.join(logDir, basenameForChunk(currentChunkIndex));
  try {
    if (existsSync(candidate) && statSync(candidate).size >= rotateBytes) {
      currentChunkIndex += 1;
      candidate = path.join(logDir, basenameForChunk(currentChunkIndex));
    }
  } catch {
    // Fall through to the current candidate.
  }
  return candidate;
}

export function getDesktopOpLogBasename() {
  return LOG_BASENAME;
}

export function getDesktopOpLogPath() {
  const dir = resolveDesktopOpLogDirs()[0];
  return dir ? path.join(dir, basenameForChunk(currentChunkIndex)) : null;
}

export function getLatestDesktopOpLogPath() {
  const candidates = [];
  for (const dir of resolveDesktopOpLogDirs()) {
    try {
      for (const name of readdirSync(dir)) {
        if (
          name === "desktop-op.log" ||
          /^desktop-op-\d{8}-\d{6}(?:-\d+)?\.log(?:\.\d+)?$/.test(name)
        ) {
          const filePath = path.join(dir, name);
          const st = statSync(filePath);
          candidates.push({ filePath, mtime: st.mtimeMs });
        }
      }
    } catch {
      // ignore unreadable dirs
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0]?.filePath ?? getDesktopOpLogPath();
}

export function pruneDesktopOpLogs() {
  const removed = [];
  const maxTotalBytes = parseDesktopOpMaxTotalBytes();
  for (const dir of resolveDesktopOpLogDirs()) {
    mkdirSync(dir, { recursive: true });
    const result = pruneLogFiles(dir, {
      prefix: LOG_PREFIX,
      protectBasenames: [LOG_BASENAME, basenameForChunk(currentChunkIndex)],
      maxTotalBytes,
      maxFileCount: null,
    });
    removed.push(...result.removed);
  }
  return { removed };
}

/**
 * @param {{ ts?: string, level?: string, module?: string, msg?: string, event?: string, sid?: string, context?: Record<string, unknown>, fields?: Record<string, unknown>, data?: Record<string, unknown> }} entry
 */
export function writeDesktopClientLog(entry) {
  if (!isDesktopUnifiedLogEnabled() || !entry?.msg) {
    return;
  }
  pruneDesktopOpLogs();

  const details = {
    level: entry.level ?? "info",
    module: entry.module ?? "unknown",
  };
  if (entry.event) {
    details.event = truncStr(String(entry.event), 160);
  }
  if (entry.sid) {
    details.sid = truncStr(String(entry.sid), 48);
  }
  const mergedDetails = {
    ...(entry.context && typeof entry.context === "object"
      ? entry.context
      : {}),
    ...(entry.data && typeof entry.data === "object" ? entry.data : {}),
    ...(entry.fields && typeof entry.fields === "object" ? entry.fields : {}),
  };
  if (Object.keys(mergedDetails).length) {
    const maxDataLen = entry.module === "mindmapOp" ? 100_000 : 2048;
    for (const [key, value] of Object.entries(mergedDetails)) {
      if (typeof value === "string") {
        details[key] = truncStr(value, maxDataLen);
      } else if (
        typeof value === "number" ||
        typeof value === "boolean" ||
        value === null
      ) {
        details[key] = value;
      } else {
        try {
          details[key] = truncStr(JSON.stringify(value), maxDataLen);
        } catch {
          details[key] = "[unserializable]";
        }
      }
    }
  }

  const line = `${JSON.stringify({
    ts: entry.ts || new Date().toISOString(),
    category: "client",
    event: truncStr(String(entry.msg), 4000),
    pid: process.pid,
    details,
  })}\n`;

  for (const logDir of resolveDesktopOpLogDirs()) {
    try {
      mkdirSync(logDir, { recursive: true });
      const logPath = resolveWritePath(logDir);
      appendFileSync(logPath, line, "utf8");
    } catch {
      // 单个目录失败不阻断 ingest
    }
  }
}
