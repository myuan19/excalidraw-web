/**
 * folderMapping（Desktop 专用 files API）操作日志。
 * 仅 apps/desktop 使用，Web 的 server/routes/files.js 不受影响。
 */
import {
  isDesktopDebugEnabled,
  truncDesktopStr,
  writeDesktopLog,
} from "../../src/desktopLogger.mjs";

function shortId(id) {
  return typeof id === "string" && id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

export function logFilesRequest(req, res, startedAt) {
  if (!isDesktopDebugEnabled()) {
    return;
  }
  const pathname = (req.originalUrl || req.url || "").split("?")[0] || "";
  const ms = Date.now() - startedAt;
  const level =
    res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
  writeDesktopLog("files", "http", {
    level,
    method: req.method,
    path: pathname,
    status: res.statusCode,
    ms,
    query: Object.keys(req.query || {}).length ? req.query : undefined,
    contentLength: req.headers["content-length"] ?? undefined,
    ifNoneMatch: req.headers["if-none-match"]
      ? truncDesktopStr(String(req.headers["if-none-match"]), 80)
      : undefined,
  });
}

export function logFilesOperation(event, details = {}) {
  if (!isDesktopDebugEnabled()) {
    return;
  }
  writeDesktopLog("files", event, details);
}

export function summarizePutBody(body) {
  if (!body || typeof body !== "object") {
    return { bodyKeys: [] };
  }
  const hasData = Object.prototype.hasOwnProperty.call(body, "data");
  const hasThumb = Object.prototype.hasOwnProperty.call(body, "thumbnail");
  const elementCount =
    hasData && Array.isArray(body.data?.elements) ? body.data.elements.length : null;
  const fileKeysCount =
    hasData && body.data?.files && typeof body.data.files === "object"
      ? Object.keys(body.data.files).length
      : null;
  return {
    bodyKeys: Object.keys(body),
    hasData,
    hasName: typeof body.name === "string" && body.name.trim().length > 0,
    hasThumbnailField: hasThumb,
    thumbLen:
      typeof body.thumbnail === "string" ? body.thumbnail.length : undefined,
    clearThumb: body.thumbnail === null,
    archiveLabel: body.archiveLabel ? truncDesktopStr(String(body.archiveLabel), 80) : "",
    elementCount,
    fileKeysCount,
    kind: body.data?.kind ?? body.data?.type ?? undefined,
  };
}

export function logPutFile(id, body, outcome) {
  logFilesOperation("put-file", {
    id: shortId(id),
    ...summarizePutBody(body),
    ...outcome,
  });
}

export function logGetFile(id, outcome) {
  logFilesOperation("get-file", {
    id: shortId(id),
    ...outcome,
  });
}

export function logDocumentError(operation, id, error) {
  logFilesOperation("document-error", {
    operation,
    id: shortId(id),
    code: error?.code,
    message: error instanceof Error ? error.message : String(error),
  });
}
