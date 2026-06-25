import {
  parseForkLocalCache,
  toForkLocalCacheStored,
  type ForkLocalCacheRecord,
} from "./forkFileTypes";
import { createLogger } from "../lib/logger";

const logStash = createLogger({ module: "stash" });

const PREFIX = "excalidraw-file-";

type MindMapCacheNode = {
  data?: { text?: unknown; richText?: unknown };
  children?: MindMapCacheNode[];
};

function normalizeCacheText(text: unknown): string {
  return String(text ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countMindMapCacheNodes(node: MindMapCacheNode | null | undefined): number {
  if (!node) {
    return 0;
  }
  const children = Array.isArray(node.children) ? node.children : [];
  return 1 + children.reduce((sum, child) => sum + countMindMapCacheNodes(child), 0);
}

function flattenMindMapCacheNodes(
  node: MindMapCacheNode | null | undefined,
  path: string[] = ["root"],
  out: Record<string, unknown>[] = [],
): Record<string, unknown>[] {
  if (!node || out.length >= 500) {
    return out;
  }
  const children = Array.isArray(node.children) ? node.children : [];
  out.push({
    path: path.join("."),
    text: normalizeCacheText(node.data?.text).slice(0, 120),
    rawTextLen: String(node.data?.text ?? "").length,
    richText: node.data?.richText === true,
    childCount: children.length,
  });
  children.forEach((child, index) => {
    if (out.length < 500) {
      flattenMindMapCacheNodes(child, [...path, String(index)], out);
    }
  });
  return out;
}

function summarizeMindMapCacheNode(
  node: MindMapCacheNode | null | undefined,
  depth = 0,
): Record<string, unknown> | null {
  if (!node) {
    return null;
  }
  const children = Array.isArray(node.children) ? node.children : [];
  return {
    text: normalizeCacheText(node.data?.text).slice(0, 80),
    rawTextLen: String(node.data?.text ?? "").length,
    richText: node.data?.richText === true,
    childCount: children.length,
    children:
      depth >= 2
        ? undefined
        : children
            .slice(0, 8)
            .map((child) => summarizeMindMapCacheNode(child, depth + 1)),
    truncatedChildren: Math.max(0, children.length - 8),
  };
}

function summarizeLocalCacheRecordForLog(
  data: ForkLocalCacheRecord,
): Record<string, unknown> {
  const document =
    data.document && typeof data.document === "object" ? data.document : null;
  const mindMapRoot =
    document?.kind === "mindmap" &&
    document.data &&
    typeof document.data === "object" &&
    "root" in document.data
      ? (document.data.root as MindMapCacheNode)
      : null;
  const elementCount = Array.isArray(data.elements) ? data.elements.length : 0;
  const filesCount =
    data.files && typeof data.files === "object"
      ? Object.keys(data.files).length
      : 0;
  return {
    documentKind: document?.kind ?? null,
    containerVersion: document?.containerVersion ?? null,
    formatVersion: document?.formatVersion ?? null,
    elementCount,
    deltasCount: data.deltas.length,
    filesCount,
    meta: data.meta ?? null,
    mindMap:
      mindMapRoot !== null
        ? {
            nodeCount: countMindMapCacheNodes(mindMapRoot),
            root: summarizeMindMapCacheNode(mindMapRoot),
            flatNodes: flattenMindMapCacheNodes(mindMapRoot),
            flatNodesTruncated: countMindMapCacheNodes(mindMapRoot) > 500,
          }
        : null,
  };
}

function emitSyncState(): void {
  window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
}

function mergeServerMeta(
  existing: ForkLocalCacheRecord["meta"] | undefined,
  incoming: ForkLocalCacheRecord["meta"] | undefined,
): ForkLocalCacheRecord["meta"] | undefined {
  const next = {
    ...(existing ?? {}),
    ...(incoming ?? {}),
  };
  return next.serverContentSha256 || typeof next.serverVersion === "number"
    ? next
    : undefined;
}

/**
 * 哈希键 + 本地草稿整包（结构见 forkFileTypes）。
 * 未保存时在编辑防抖后写入；保存成功或与服务器基线一致时用 setLocalCache 覆盖，
 * 不再默认 removeItem，以便保留文件列表缩略与离线副本。
 * 写入带 `{ v, payload }` 信封，读取时兼容历史平铺 JSON。
 */
export const FileSyncState = {
  localCacheKey(fileId: string): string {
    return `${PREFIX}local-cache-${fileId}`;
  },

  setLocalCache(fileId: string, data: ForkLocalCacheRecord): void {
    const existingMeta = this.getLocalCache(fileId)?.meta;
    const mergedMeta = mergeServerMeta(existingMeta, data.meta);
    const record = {
      ...data,
      ...(mergedMeta ? { meta: mergedMeta } : {}),
    };
    try {
      localStorage.setItem(
        this.localCacheKey(fileId),
        JSON.stringify(toForkLocalCacheStored(record)),
      );
      const elementCount = Array.isArray(record.elements)
        ? record.elements.length
        : 0;
      logStash.debug(
        `setLocalCache ${fileId.slice(0, 8)} elements=${elementCount} deltas=${
          record.deltas.length
        } files=${Object.keys(record.files || {}).length}`,
        {
          fileId8: fileId.slice(0, 8),
          cacheSummary: summarizeLocalCacheRecordForLog(record),
        },
      );
    } catch {
      logStash.debug(`setLocalCache FAILED ${fileId.slice(0, 8)}`);
      // ignore quota
    }
    emitSyncState();
  },

  setLocalCachePreservingServerMeta(
    fileId: string,
    data: ForkLocalCacheRecord,
  ): void {
    const existingMeta = this.getLocalCache(fileId)?.meta;
    const nextMeta = {
      ...(existingMeta ?? {}),
      ...(data.meta ?? {}),
    };
    this.setLocalCache(fileId, {
      ...data,
      ...(nextMeta.serverContentSha256 ||
      typeof nextMeta.serverVersion === "number"
        ? { meta: nextMeta }
        : {}),
    });
  },

  setServerBackedLocalCache(fileId: string, data: ForkLocalCacheRecord): void {
    this.setLocalCachePreservingServerMeta(fileId, data);
  },

  setServerSyncedLocalCache(fileId: string, data: ForkLocalCacheRecord): void {
    const record = {
      ...data,
      ...(data.meta ? { meta: data.meta } : {}),
    };
    try {
      localStorage.setItem(
        this.localCacheKey(fileId),
        JSON.stringify(toForkLocalCacheStored(record)),
      );
    } catch {
      logStash.debug(`setServerSyncedLocalCache FAILED ${fileId.slice(0, 8)}`);
    }
    emitSyncState();
  },

  setLocalDraftCache(fileId: string, data: ForkLocalCacheRecord): void {
    this.setLocalCache(fileId, data);
  },

  getLocalCache(fileId: string): ForkLocalCacheRecord | null {
    try {
      const raw = localStorage.getItem(this.localCacheKey(fileId));
      if (!raw) {
        logStash.debug(`getLocalCache ${fileId.slice(0, 8)} hit=false`);
        return null;
      }
      const parsed: unknown = JSON.parse(raw);
      const record = parseForkLocalCache(parsed);
      const elementCount = Array.isArray(record?.elements)
        ? record.elements.length
        : 0;
      logStash.debug(
        `getLocalCache ${fileId.slice(
          0,
          8,
        )} hit=true elements=${elementCount} deltas=${
          record?.deltas.length ?? 0
        } files=${Object.keys(record?.files || {}).length}`,
      );
      return record;
    } catch {
      logStash.debug(`getLocalCache FAILED ${fileId.slice(0, 8)}`);
      return null;
    }
  },

  clearLocalCache(fileId: string): void {
    localStorage.removeItem(this.localCacheKey(fileId));
    emitSyncState();
  },

  baselineHashKey(fileId: string): string {
    return `${PREFIX}baseline-hash-${fileId}`;
  },

  draftHashKey(fileId: string): string {
    return `${PREFIX}draft-hash-${fileId}`;
  },

  setBaselineHash(fileId: string, hash: string): void {
    localStorage.setItem(this.baselineHashKey(fileId), hash);
    logStash.debug(`setBaselineHash ${fileId.slice(0, 8)} hash=${hash}`);
    emitSyncState();
  },

  getBaselineHash(fileId: string): string | null {
    return localStorage.getItem(this.baselineHashKey(fileId));
  },

  setDraftHash(fileId: string, hash: string): void {
    localStorage.setItem(this.draftHashKey(fileId), hash);
    logStash.debug(`setDraftHash ${fileId.slice(0, 8)} hash=${hash}`);
    emitSyncState();
  },

  getDraftHash(fileId: string): string | null {
    return localStorage.getItem(this.draftHashKey(fileId));
  },

  clearBaselineHash(fileId: string): void {
    localStorage.removeItem(this.baselineHashKey(fileId));
    logStash.debug(`clearBaselineHash ${fileId.slice(0, 8)}`);
    emitSyncState();
  },

  clearDraftHash(fileId: string): void {
    localStorage.removeItem(this.draftHashKey(fileId));
    logStash.debug(`clearDraftHash ${fileId.slice(0, 8)}`);
    emitSyncState();
  },

  clearHashStateForFile(fileId: string): void {
    localStorage.removeItem(this.baselineHashKey(fileId));
    localStorage.removeItem(this.draftHashKey(fileId));
    localStorage.removeItem(this.serverHashKey(fileId));
    logStash.debug(`clearHashStateForFile ${fileId.slice(0, 8)}`);
    emitSyncState();
  },

  /**
   * synced: draft hash matches server baseline (last 保存).
   * draft: local edits differ from server baseline.
   */
  getSyncState(fileId: string): "synced" | "draft" {
    const draft = this.getDraftHash(fileId);
    const baseline = this.getBaselineHash(fileId);
    if (!draft) {
      return "synced";
    }
    if (!baseline || draft !== baseline) {
      return "draft";
    }
    return "synced";
  },

  /** Set both baseline and draft to the same hash (common after save / init). */
  alignHashes(fileId: string, hash: string): void {
    localStorage.setItem(this.baselineHashKey(fileId), hash);
    localStorage.setItem(this.draftHashKey(fileId), hash);
    logStash.debug(`alignHashes ${fileId.slice(0, 8)} hash=${hash}`);
    emitSyncState();
  },

  hasUnsavedChanges(fileId: string): boolean {
    return this.getSyncState(fileId) === "draft";
  },

  serverHashKey(fileId: string): string {
    return `${PREFIX}server-sha256-${fileId}`;
  },

  setServerHash(fileId: string, sha256: string): void {
    localStorage.setItem(this.serverHashKey(fileId), sha256);
    logStash.debug(`setServerHash ${fileId.slice(0, 8)} sha=${sha256}`);
  },

  getServerHash(fileId: string): string | null {
    return localStorage.getItem(this.serverHashKey(fileId));
  },

  isServerChanged(fileId: string, remoteSha256: string | null): boolean {
    if (!remoteSha256) {
      return false;
    }
    const local = this.getServerHash(fileId);
    if (!local) {
      return true;
    }
    return local !== remoteSha256;
  },

  localEditTimeKey(fileId: string): string {
    return `${PREFIX}local-edit-time-${fileId}`;
  },

  setLocalEditTime(fileId: string): void {
    localStorage.setItem(
      this.localEditTimeKey(fileId),
      new Date().toISOString(),
    );
    logStash.debug(`setLocalEditTime ${fileId.slice(0, 8)}`);
    emitSyncState();
  },

  getLocalEditTime(fileId: string): string | null {
    return localStorage.getItem(this.localEditTimeKey(fileId));
  },

  clearLocalEditTime(fileId: string): void {
    localStorage.removeItem(this.localEditTimeKey(fileId));
    logStash.debug(`clearLocalEditTime ${fileId.slice(0, 8)}`);
  },
};
