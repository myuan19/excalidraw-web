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

function normalizeMindMapText(text) {
  return String(text ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getMindMapRoot(data) {
  if (!data || typeof data !== "object") {
    return null;
  }
  if (data.kind === "mindmap" && data.data && typeof data.data === "object") {
    return data.data.root ?? null;
  }
  return data.root ?? null;
}

function countMindMapNodes(node) {
  if (!node || typeof node !== "object") {
    return 0;
  }
  const children = Array.isArray(node.children) ? node.children : [];
  return 1 + children.reduce((sum, child) => sum + countMindMapNodes(child), 0);
}

function flattenMindMapNodes(node, path = ["root"], out = []) {
  if (!node || typeof node !== "object" || out.length >= 500) {
    return out;
  }
  const children = Array.isArray(node.children) ? node.children : [];
  out.push({
    path: path.join("."),
    text: normalizeMindMapText(node.data?.text).slice(0, 120),
    rawTextLen: String(node.data?.text ?? "").length,
    richText: node.data?.richText === true,
    childCount: children.length,
  });
  children.forEach((child, index) => {
    if (out.length < 500) {
      flattenMindMapNodes(child, [...path, String(index)], out);
    }
  });
  return out;
}

function summarizeMindMapData(data) {
  const root = getMindMapRoot(data);
  if (!root || typeof root !== "object") {
    return null;
  }
  const children = Array.isArray(root.children) ? root.children : [];
  const nodeCount = countMindMapNodes(root);
  return {
    nodeCount,
    rootText: normalizeMindMapText(root.data?.text).slice(0, 120),
    rootRawTextLen: String(root.data?.text ?? "").length,
    rootChildCount: children.length,
    firstChildTexts: children
      .slice(0, 12)
      .map((child) => normalizeMindMapText(child.data?.text).slice(0, 80)),
    flatNodesTruncated: nodeCount > 500,
  };
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
    hasData && Array.isArray(body.data?.elements)
      ? body.data.elements.length
      : null;
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
    archiveLabel: body.archiveLabel
      ? truncDesktopStr(String(body.archiveLabel), 80)
      : "",
    checkpointPolicyMode:
      body.checkpointPolicy && typeof body.checkpointPolicy === "object"
        ? body.checkpointPolicy.mode ?? null
        : null,
    elementCount,
    fileKeysCount,
    kind: body.data?.kind ?? body.data?.type ?? undefined,
    mindMap: summarizeMindMapData(body.data),
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
