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

function envLogOn(val) {
  const v = (val ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export function isDebugLogAllowed() {
  return (
    envLogOn(process.env.EDITORHUB_DEBUG_ENABLED) ||
    envLogOn(process.env.DEPLOY_DEBUG)
  );
}

/** Frontend log ingest (POST /api/logs). Off if either env is explicitly disabled. */
export function isClientLogIngestEnabled() {
  if (envLogOff(process.env.LOG_CLIENT_INGEST)) {
    return false;
  }
  if (envLogOff(process.env.EXCALIDRAW_CLIENT_LOG)) {
    return false;
  }
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

function normalizeMindMapText(text) {
  return String(text ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function compactMindMapNode(node, depth = 0) {
  if (!node || typeof node !== "object") {
    return null;
  }
  const children = Array.isArray(node.children) ? node.children : [];
  return {
    text: normalizeMindMapText(node.data?.text).slice(0, 80),
    rawTextLen: String(node.data?.text ?? "").length,
    richText: node.data?.richText === true,
    childCount: children.length,
    children:
      depth >= 2
        ? undefined
        : children
            .slice(0, 8)
            .map((child) => compactMindMapNode(child, depth + 1)),
    truncatedChildren: Math.max(0, children.length - 8),
  };
}

function summarizeMindMapPayload(data) {
  const root =
    data?.kind === "mindmap" && data?.data && typeof data.data === "object"
      ? data.data.root
      : data?.root;
  if (!root || typeof root !== "object") {
    return null;
  }
  const firstChildren = Array.isArray(root.children) ? root.children : [];
  const nodeCount = countMindMapNodes(root);
  return {
    nodeCount,
    rootText: normalizeMindMapText(root.data?.text).slice(0, 120),
    rootRawTextLen: String(root.data?.text ?? "").length,
    rootChildCount: firstChildren.length,
    firstChildTexts: firstChildren
      .slice(0, 12)
      .map((child) => normalizeMindMapText(child.data?.text).slice(0, 80)),
    compactTree: compactMindMapNode(root),
    flatNodes: flattenMindMapNodes(root),
    flatNodesTruncated: nodeCount > 500,
  };
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
    kind: data.kind ?? null,
    containerVersion: data.containerVersion ?? null,
    formatVersion: data.formatVersion ?? null,
    version: data.version,
    elementCount: Array.isArray(elements) ? elements.length : null,
    fileKeysCount:
      files && typeof files === "object" ? Object.keys(files).length : null,
    appStateKeys:
      appState && typeof appState === "object"
        ? Object.keys(appState).slice(0, 40)
        : null,
    mindMap: summarizeMindMapPayload(data),
  };
  if (isApiDebugEnabled()) {
    sceneLog.info("scene summary (EXCALIDRAW_API_DEBUG)", summary);
  }
  return summary;
}
