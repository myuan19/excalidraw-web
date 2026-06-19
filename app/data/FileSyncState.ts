import {
  parseForkLocalCache,
  toForkLocalCacheStored,
  type ForkLocalCacheRecord,
} from "./forkFileTypes";
import { getClientTabId } from "./clientRequestContext";
import { createLogger } from "../lib/logger";

const logStash = createLogger({ module: "stash" });

function logStashEvent(
  level: "debug" | "info" | "warn",
  event: string,
  message: string,
  fields?: Record<string, unknown>,
): void {
  logStash.event(level, `state.stash.${event}`, message, { fields });
}

function hash8(hash: string | null | undefined): string | null {
  return hash ? hash.slice(0, 8) : null;
}

function fileId8(fileId: string): string {
  return fileId.slice(0, 8);
}

const PREFIX = "excalidraw-file-";

function emitSyncState(): void {
  window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
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
    try {
      localStorage.setItem(
        this.localCacheKey(fileId),
        JSON.stringify(toForkLocalCacheStored(data)),
      );
      const elementCount = Array.isArray(data.elements)
        ? data.elements.length
        : 0;
      logStashEvent("info", "local_cache.set", "setLocalCache", {
        clientTabId: getClientTabId(),
        fileId8: fileId8(fileId),
        elements: elementCount,
        deltas: data.deltas.length,
        files: Object.keys(data.files || {}).length,
        serverVersion: data.meta?.serverVersion ?? null,
        serverSha8: hash8(data.meta?.serverContentSha256),
      });
    } catch {
      logStashEvent("warn", "local_cache.set_failed", "setLocalCache failed", {
        clientTabId: getClientTabId(),
        fileId8: fileId8(fileId),
      });
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
    this.setLocalCache(fileId, data);
  },

  setLocalDraftCache(fileId: string, data: ForkLocalCacheRecord): void {
    this.setLocalCache(fileId, data);
  },

  getLocalCache(fileId: string): ForkLocalCacheRecord | null {
    try {
      const raw = localStorage.getItem(this.localCacheKey(fileId));
      if (!raw) {
        logStashEvent("debug", "local_cache.get", "getLocalCache miss", {
          fileId8: fileId8(fileId),
          hit: false,
        });
        return null;
      }
      const parsed: unknown = JSON.parse(raw);
      const record = parseForkLocalCache(parsed);
      const elementCount = Array.isArray(record?.elements)
        ? record.elements.length
        : 0;
      logStashEvent("debug", "local_cache.get", "getLocalCache hit", {
        fileId8: fileId8(fileId),
        hit: true,
        elements: elementCount,
        deltas: record?.deltas.length ?? 0,
        files: Object.keys(record?.files || {}).length,
      });
      return record;
    } catch {
      logStashEvent("debug", "local_cache.get_failed", "getLocalCache failed", {
        fileId8: fileId8(fileId),
      });
      return null;
    }
  },

  clearLocalCache(fileId: string): void {
    localStorage.removeItem(this.localCacheKey(fileId));
    logStashEvent("info", "local_cache.clear", "clearLocalCache", {
      clientTabId: getClientTabId(),
      fileId8: fileId8(fileId),
    });
    emitSyncState();
  },

  baselineHashKey(fileId: string): string {
    return `${PREFIX}baseline-hash-${fileId}`;
  },

  draftHashKey(fileId: string): string {
    return `${PREFIX}draft-hash-${fileId}`;
  },

  setBaselineHash(fileId: string, hash: string): void {
    const previous = this.getBaselineHash(fileId);
    localStorage.setItem(this.baselineHashKey(fileId), hash);
    logStashEvent("info", "baseline_hash.set", "setBaselineHash", {
      clientTabId: getClientTabId(),
      fileId8: fileId8(fileId),
      previousHash8: hash8(previous),
      hash8: hash8(hash),
      changed: previous !== hash,
    });
    emitSyncState();
  },

  getBaselineHash(fileId: string): string | null {
    return localStorage.getItem(this.baselineHashKey(fileId));
  },

  setDraftHash(fileId: string, hash: string): void {
    const previous = this.getDraftHash(fileId);
    const baseline = this.getBaselineHash(fileId);
    localStorage.setItem(this.draftHashKey(fileId), hash);
    logStashEvent("info", "draft_hash.set", "setDraftHash", {
      clientTabId: getClientTabId(),
      fileId8: fileId8(fileId),
      previousHash8: hash8(previous),
      hash8: hash8(hash),
      baselineHash8: hash8(baseline),
      changed: previous !== hash,
      matchesBaseline: !!baseline && baseline === hash,
    });
    emitSyncState();
  },

  getDraftHash(fileId: string): string | null {
    return localStorage.getItem(this.draftHashKey(fileId));
  },

  clearBaselineHash(fileId: string): void {
    const previous = this.getBaselineHash(fileId);
    localStorage.removeItem(this.baselineHashKey(fileId));
    logStashEvent("info", "baseline_hash.clear", "clearBaselineHash", {
      clientTabId: getClientTabId(),
      fileId8: fileId8(fileId),
      previousHash8: hash8(previous),
    });
    emitSyncState();
  },

  clearDraftHash(fileId: string): void {
    const previous = this.getDraftHash(fileId);
    localStorage.removeItem(this.draftHashKey(fileId));
    logStashEvent("info", "draft_hash.clear", "clearDraftHash", {
      clientTabId: getClientTabId(),
      fileId8: fileId8(fileId),
      previousHash8: hash8(previous),
    });
    emitSyncState();
  },

  clearHashStateForFile(fileId: string): void {
    const previousBaseline = this.getBaselineHash(fileId);
    const previousDraft = this.getDraftHash(fileId);
    const previousServer = this.getServerHash(fileId);
    localStorage.removeItem(this.baselineHashKey(fileId));
    localStorage.removeItem(this.draftHashKey(fileId));
    localStorage.removeItem(this.serverHashKey(fileId));
    logStashEvent("info", "hash_state.clear", "clearHashStateForFile", {
      clientTabId: getClientTabId(),
      fileId8: fileId8(fileId),
      previousBaselineHash8: hash8(previousBaseline),
      previousDraftHash8: hash8(previousDraft),
      previousServerSha8: hash8(previousServer),
    });
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
    const previousBaseline = this.getBaselineHash(fileId);
    const previousDraft = this.getDraftHash(fileId);
    localStorage.setItem(this.baselineHashKey(fileId), hash);
    localStorage.setItem(this.draftHashKey(fileId), hash);
    logStashEvent("info", "hashes.align", "alignHashes", {
      clientTabId: getClientTabId(),
      fileId8: fileId8(fileId),
      previousBaselineHash8: hash8(previousBaseline),
      previousDraftHash8: hash8(previousDraft),
      hash8: hash8(hash),
      baselineChanged: previousBaseline !== hash,
      draftChanged: previousDraft !== hash,
    });
    emitSyncState();
  },

  hasUnsavedChanges(fileId: string): boolean {
    return this.getSyncState(fileId) === "draft";
  },

  serverHashKey(fileId: string): string {
    return `${PREFIX}server-sha256-${fileId}`;
  },

  setServerHash(fileId: string, sha256: string): void {
    const previous = this.getServerHash(fileId);
    localStorage.setItem(this.serverHashKey(fileId), sha256);
    logStashEvent("info", "server_hash.set", "setServerHash", {
      clientTabId: getClientTabId(),
      fileId8: fileId8(fileId),
      previousSha8: hash8(previous),
      sha8: hash8(sha256),
      changed: previous !== sha256,
    });
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
    const previous = this.getLocalEditTime(fileId);
    const next = new Date().toISOString();
    localStorage.setItem(this.localEditTimeKey(fileId), next);
    logStashEvent("info", "local_edit_time.set", "setLocalEditTime", {
      clientTabId: getClientTabId(),
      fileId8: fileId8(fileId),
      previous,
      next,
    });
    emitSyncState();
  },

  getLocalEditTime(fileId: string): string | null {
    return localStorage.getItem(this.localEditTimeKey(fileId));
  },

  clearLocalEditTime(fileId: string): void {
    const previous = this.getLocalEditTime(fileId);
    localStorage.removeItem(this.localEditTimeKey(fileId));
    logStashEvent("info", "local_edit_time.clear", "clearLocalEditTime", {
      clientTabId: getClientTabId(),
      fileId8: fileId8(fileId),
      previous,
    });
  },
};
