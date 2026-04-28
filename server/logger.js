/**
 * API / 诊断：`apiLog` → `stdout`，`docker logs <容器>` 可见。
 * `apiLogDebug` 仅在 EXCALIDRAW_API_DEBUG=1 时出现（scene/appState 等更细）。
 */
const DEBUG =
  process.env.EXCALIDRAW_API_DEBUG === "1" ||
  process.env.EXCALIDRAW_API_DEBUG === "true";

function ts() {
  return new Date().toISOString();
}

export function apiLog(area, message, meta) {
  if (meta !== undefined) {
    console.log(`[excalidraw-api] ${ts()} [${area}] ${message}`, meta);
  } else {
    console.log(`[excalidraw-api] ${ts()} [${area}] ${message}`);
  }
}

export function apiLogDebug(area, message, meta) {
  if (!DEBUG) {
    return;
  }
  apiLog(`${area}:debug`, message, meta);
}

/**
 * 前端诊断 POST /api/client-logs 是否写入 DATA_DIR/logs/client.log（默认开启）。
 * 关闭：EXCALIDRAW_CLIENT_LOG=0 | false | off | no
 */
export function isClientLogIngestEnabled() {
  const v = (process.env.EXCALIDRAW_CLIENT_LOG ?? "").trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") {
    return false;
  }
  return true;
}

/**
 * 开启后：所有 /api/* 请求结束时打 [http] 一行（含 ms、UA）。
 * 默认仍仅对路径以 /files 开头的请求打完成日志（见 index.js）。
 */
export function isHttpTraceEnabled() {
  const v = (process.env.EXCALIDRAW_HTTP_TRACE ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** 对每个 GET thumbnail 打点（id + 字节）；docker 内设 EXCALIDRAW_THUMB_AUDIT_LOG=1（官方镜像默认开） */
export function isThumbAuditLogEnabled() {
  const v = (process.env.EXCALIDRAW_THUMB_AUDIT_LOG ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** 避免把超大字符串打进日志 */
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
  apiLogDebug("scene", "scene summary", summary);
  return summary;
}
