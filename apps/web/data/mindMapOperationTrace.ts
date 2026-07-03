import { FileSyncState } from "./FileSyncState";
import { isDebugLoggingEnabled } from "./appSettings";
import { hashDocumentSnapshot } from "./sceneHash";
import { devDebug } from "../lib/devDebug";
import { createLogger } from "../lib/logger";

import type { ManagedDocument } from "./documentTypes";
import type { MindMapDocumentData } from "./formats/MindMapAdapter";

const opLog = createLogger({ module: "mindmapOp" });
const TRACE_SESSION_KEY = "editorhub-mindmap-op-trace-sid";
const FULL_DUMP_MAX_CHARS = 50_000;
let seq = 0;

type MindMapNodeLike = {
  data?: {
    text?: unknown;
    richText?: unknown;
    expand?: unknown;
  };
  children?: MindMapNodeLike[];
};

function getTraceSessionId(): string {
  if (typeof window === "undefined") {
    return "server";
  }
  try {
    let sid = sessionStorage.getItem(TRACE_SESSION_KEY);
    if (!sid) {
      sid = crypto.randomUUID?.() ?? String(Date.now());
      sessionStorage.setItem(TRACE_SESSION_KEY, sid);
    }
    return sid.slice(0, 8);
  } catch {
    return String(Date.now()).slice(-8);
  }
}

function isFullDumpEnabled(): boolean {
  return isDebugLoggingEnabled();
}

function normalizeText(text: unknown): string {
  return String(text ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactNode(
  node: MindMapNodeLike | null | undefined,
  depth = 0,
): Record<string, unknown> | null {
  if (!node) {
    return null;
  }
  const children = Array.isArray(node.children) ? node.children : [];
  return {
    text: normalizeText(node.data?.text).slice(0, 80),
    rawTextLen: String(node.data?.text ?? "").length,
    richText: node.data?.richText === true,
    expand: node.data?.expand ?? null,
    childCount: children.length,
    children:
      depth >= 2
        ? undefined
        : children.slice(0, 8).map((child) => compactNode(child, depth + 1)),
    truncatedChildren: Math.max(0, children.length - 8),
  };
}

function countNodes(node: MindMapNodeLike | null | undefined): number {
  if (!node) {
    return 0;
  }
  return (
    1 +
    (Array.isArray(node.children)
      ? node.children.reduce((sum, child) => sum + countNodes(child), 0)
      : 0)
  );
}

function flattenNodes(
  node: MindMapNodeLike | null | undefined,
  path: string[] = ["root"],
  out: Record<string, unknown>[] = [],
): Record<string, unknown>[] {
  if (!node || out.length >= 500) {
    return out;
  }
  const children = Array.isArray(node.children) ? node.children : [];
  out.push({
    path: path.join("."),
    text: normalizeText(node.data?.text).slice(0, 120),
    rawTextLen: String(node.data?.text ?? "").length,
    richText: node.data?.richText === true,
    childCount: children.length,
  });
  children.forEach((child, index) => {
    if (out.length < 500) {
      flattenNodes(child, [...path, String(index)], out);
    }
  });
  return out;
}

function safeJsonPreview(value: unknown): string | undefined {
  if (!isFullDumpEnabled()) {
    return undefined;
  }
  try {
    const json = JSON.stringify(value);
    if (json.length <= FULL_DUMP_MAX_CHARS) {
      return json;
    }
    return `${json.slice(0, FULL_DUMP_MAX_CHARS)}...[truncated ${
      json.length - FULL_DUMP_MAX_CHARS
    } chars]`;
  } catch {
    return "[unserializable]";
  }
}

export function summarizeMindMapTraceData(
  data: MindMapDocumentData | null | undefined,
): Record<string, unknown> | null {
  if (!data?.root) {
    return null;
  }
  // 关闭调试时短路：该函数常作为 trace 实参被无条件求值（JS 实参先算），
  // 全树遍历/展平在大图上是热路径主线程开销（拖拽卡顿的组成部分）。
  if (!isDebugLoggingEnabled()) {
    return null;
  }
  const root = data.root as MindMapNodeLike;
  const firstChildren = Array.isArray(root.children) ? root.children : [];
  return {
    nodeCount: countNodes(root),
    rootText: normalizeText(root.data?.text).slice(0, 120),
    rootRawTextLen: String(root.data?.text ?? "").length,
    rootChildCount: firstChildren.length,
    firstChildTexts: firstChildren
      .slice(0, 12)
      .map((child) => normalizeText(child.data?.text).slice(0, 80)),
    compactTree: compactNode(root),
    flatNodes: flattenNodes(root),
    flatNodesTruncated: countNodes(root) > 500,
    fullJson: safeJsonPreview(data),
  };
}

export function summarizeMindMapTraceDocument(
  document: ManagedDocument<MindMapDocumentData> | null | undefined,
): Record<string, unknown> | null {
  if (!document) {
    return null;
  }
  // 同上：hashDocumentSnapshot 是整文档 stringify + 深排序，关闭调试时不做。
  if (!isDebugLoggingEnabled()) {
    return null;
  }
  return {
    kind: document.kind,
    containerVersion: document.containerVersion,
    formatVersion: document.formatVersion,
    contentHash: hashDocumentSnapshot(document),
    data: summarizeMindMapTraceData(document.data),
    fullJson: safeJsonPreview(document),
  };
}

export function readMindMapTraceFileState(
  fileId: string | null | undefined,
): Record<string, unknown> | null {
  if (!fileId) {
    return null;
  }
  // 关闭调试时短路：getLocalCache 会同步 getItem+JSON.parse 整份文档，
  // 再对缓存文档全量求哈希；作为 trace 实参时每次调用都会白付这笔钱。
  if (!isDebugLoggingEnabled()) {
    return null;
  }
  const localCache = FileSyncState.getLocalCache(fileId);
  return {
    fileId8: fileId.slice(0, 8),
    baselineHash: FileSyncState.getBaselineHash(fileId),
    draftHash: FileSyncState.getDraftHash(fileId),
    serverHash: FileSyncState.getServerHash(fileId),
    localEditTime: FileSyncState.getLocalEditTime(fileId),
    syncState: FileSyncState.getSyncState(fileId),
    hasLocalCache: !!localCache,
    localCacheDocument:
      localCache?.document?.kind === "mindmap"
        ? summarizeMindMapTraceDocument(
            localCache.document as ManagedDocument<MindMapDocumentData>,
          )
        : null,
  };
}

export function traceMindMapDraftStatusTransition(
  label: string,
  data: Record<string, unknown> & {
    fileId8: string | null;
    from: string;
    to: string;
  },
): void {
  if (data.from === data.to) {
    return;
  }
  traceMindMapOperation(label, data);
}

export function traceMindMapOperation(
  label: string,
  data?: Record<string, unknown> | (() => Record<string, unknown>),
): void {
  if (!isDebugLoggingEnabled()) {
    return;
  }
  // 支持惰性数据：重开销的采样统计放进函数，仅在调试开启时求值。
  const resolved = typeof data === "function" ? data() : data;
  seq += 1;
  const payload = {
    opSeq: seq,
    opSid: getTraceSessionId(),
    at: new Date().toISOString(),
    perfMs:
      typeof performance !== "undefined" ? Math.round(performance.now()) : null,
    ...(resolved ?? {}),
  };
  devDebug("mindmap-op", label, payload);
  opLog.info(label, payload);
}
