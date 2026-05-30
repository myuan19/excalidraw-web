import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { resolveDataDir } from "./dataDir.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** Local dev logs — `<dataDir>/logs/` (default `_dev_data/logs/`). */
export function resolveLogDir() {
  const fromEnv = process.env.EXCALIDRAW_LOG_DIR?.trim();
  if (fromEnv === "0" || fromEnv === "false") {
    return null;
  }
  if (fromEnv) {
    const resolved =
      fromEnv.startsWith("/") || /^[A-Za-z]:[\\/]/.test(fromEnv)
        ? fromEnv
        : join(REPO_ROOT, fromEnv);
    return resolved;
  }
  return join(resolveDataDir(), "logs");
}

export function isFileLogEnabled() {
  const flag = process.env.EXCALIDRAW_LOG_TO_FILE?.trim().toLowerCase();
  if (flag === "0" || flag === "false") return false;
  if (flag === "1" || flag === "true") return true;
  return resolveLogDir() !== null;
}

export function logRotateOptions() {
  const intervalRaw = process.env.LOG_ROTATE_INTERVAL?.trim();
  return {
    /** Single-file size before split within one session. */
    size: process.env.LOG_ROTATE_SIZE?.trim() || "10M",
    /** Optional time-based rotation (empty = disabled; each startup gets its own file). */
    interval: intervalRaw && intervalRaw !== "0" ? intervalRaw : null,
    /** Max rotated chunks kept per session file (size splits). */
    maxFiles: Number.parseInt(process.env.LOG_MAX_FILES ?? "14", 10) || 14,
    /** Max bytes for all log files in the directory; oldest files removed on startup. */
    maxTotalSize: process.env.LOG_MAX_TOTAL_SIZE?.trim() || "200M",
    /** Max session log files (server-* / client-*) before deleting oldest. */
    maxSessionFiles:
      Number.parseInt(process.env.LOG_MAX_SESSION_FILES ?? "30", 10) || 30,
    /** Plain rotated files by default; set LOG_COMPRESS=gzip to enable. */
    compress:
      process.env.LOG_COMPRESS?.trim().toLowerCase() === "gzip"
        ? "gzip"
        : false,
  };
}

export { REPO_ROOT };
