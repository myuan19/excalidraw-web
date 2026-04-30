/**
 * Server logging helpers + scene summary (diagnostics).
 * Use `createLogger` from `./lib/logger.js` in new code.
 */
import { createLogger } from "./lib/logger.js";

const sceneLog = createLogger({ module: "scene" });

export function isApiDebugEnabled() {
  return (
    process.env.EXCALIDRAW_API_DEBUG === "1" ||
    process.env.EXCALIDRAW_API_DEBUG === "true"
  );
}

function envLogOff(val) {
  const v = (val ?? "").trim().toLowerCase();
  return v === "0" || v === "false" || v === "off" || v === "no";
}

/** Frontend log ingest (POST /api/logs). Off if either env is explicitly disabled. */
export function isClientLogIngestEnabled() {
  if (envLogOff(process.env.LOG_CLIENT_INGEST)) return false;
  if (envLogOff(process.env.EXCALIDRAW_CLIENT_LOG)) return false;
  return true;
}

export function isHttpTraceEnabled() {
  const v = (process.env.EXCALIDRAW_HTTP_TRACE ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function isThumbAuditLogEnabled() {
  const v = (process.env.EXCALIDRAW_THUMB_AUDIT_LOG ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function truncStr(s, max = 200) {
  if (typeof s !== "string") {
    return s;
  }
  if (s.length <= max) {
    return s;
  }
  return `${s.slice(0, max)}…(len=${s.length})`;
}

export function summarizeScenePayload(data) {
  if (!data || typeof data !== "object") {
    return { ok: false, reason: "no data object" };
  }
  const elements = data.elements;
  const files = data.files;
  const appState = data.appState;
  const summary = {
    type: data.type,
    version: data.version,
    elementCount: Array.isArray(elements) ? elements.length : null,
    fileKeysCount:
      files && typeof files === "object" ? Object.keys(files).length : null,
    appStateKeys:
      appState && typeof appState === "object"
        ? Object.keys(appState).slice(0, 40)
        : null,
  };
  if (isApiDebugEnabled()) {
    sceneLog.info("scene summary (EXCALIDRAW_API_DEBUG)", summary);
  }
  return summary;
}
