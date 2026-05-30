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
  return {
    size: process.env.LOG_ROTATE_SIZE?.trim() || "10M",
    interval: process.env.LOG_ROTATE_INTERVAL?.trim() || "1d",
    maxFiles: Number.parseInt(process.env.LOG_MAX_FILES ?? "14", 10) || 14,
    maxSize: process.env.LOG_MAX_TOTAL_SIZE?.trim() || "200M",
    compress: "gzip",
  };
}

export { REPO_ROOT };
