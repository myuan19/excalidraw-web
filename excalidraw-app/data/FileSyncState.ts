import {
  parseForkLocalCache,
  toForkLocalCacheStored,
  type ForkLocalCacheRecord,
} from "./forkFileTypes";
import { debugLog } from "./debugLog";

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
      const elementCount = Array.isArray(data.elements) ? data.elements.length : 0;
      debugLog.stash(
        `setLocalCache ${fileId.slice(0, 8)} elements=${elementCount} deltas=${data.deltas.length} files=${Object.keys(data.files || {}).length}`,
      );
    } catch {
      debugLog.stash(`setLocalCache FAILED ${fileId.slice(0, 8)}`);
      // ignore quota
    }
    emitSyncState();
  },

  getLocalCache(fileId: string): ForkLocalCacheRecord | null {
    try {
      const raw = localStorage.getItem(this.localCacheKey(fileId));
      if (!raw) {
        debugLog.stash(`getLocalCache ${fileId.slice(0, 8)} hit=false`);
        return null;
      }
      const parsed: unknown = JSON.parse(raw);
      const record = parseForkLocalCache(parsed);
      const elementCount = Array.isArray(record?.elements)
        ? record.elements.length
        : 0;
      debugLog.stash(
        `getLocalCache ${fileId.slice(0, 8)} hit=true elements=${elementCount} deltas=${record?.deltas.length ?? 0} files=${Object.keys(record?.files || {}).length}`,
      );
      return record;
    } catch {
      debugLog.stash(`getLocalCache FAILED ${fileId.slice(0, 8)}`);
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
    emitSyncState();
  },

  getBaselineHash(fileId: string): string | null {
    return localStorage.getItem(this.baselineHashKey(fileId));
  },

  setDraftHash(fileId: string, hash: string): void {
    localStorage.setItem(this.draftHashKey(fileId), hash);
    emitSyncState();
  },

  getDraftHash(fileId: string): string | null {
    return localStorage.getItem(this.draftHashKey(fileId));
  },

  clearBaselineHash(fileId: string): void {
    localStorage.removeItem(this.baselineHashKey(fileId));
    emitSyncState();
  },

  clearDraftHash(fileId: string): void {
    localStorage.removeItem(this.draftHashKey(fileId));
    emitSyncState();
  },

  clearHashStateForFile(fileId: string): void {
    localStorage.removeItem(this.baselineHashKey(fileId));
    localStorage.removeItem(this.draftHashKey(fileId));
    emitSyncState();
  },

  /**
   * synced: draft hash matches server baseline (last 保存).
   * draft: local edits differ from server baseline.
   */
  getSyncState(fileId: string): "synced" | "draft" {
    const draft = this.getDraftHash(fileId);
    const baseline = this.getBaselineHash(fileId);
    if (!draft || !baseline) {
      return "synced";
    }
    if (draft !== baseline) {
      return "draft";
    }
    return "synced";
  },

  hasUnsavedChanges(fileId: string): boolean {
    const draft = this.getDraftHash(fileId);
    const baseline = this.getBaselineHash(fileId);
    if (!draft || !baseline) {
      return false;
    }
    return draft !== baseline;
  },

  serverHashKey(fileId: string): string {
    return `${PREFIX}server-sha256-${fileId}`;
  },

  setServerHash(fileId: string, sha256: string): void {
    localStorage.setItem(this.serverHashKey(fileId), sha256);
  },

  getServerHash(fileId: string): string | null {
    return localStorage.getItem(this.serverHashKey(fileId));
  },

  clearServerHash(fileId: string): void {
    localStorage.removeItem(this.serverHashKey(fileId));
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
    localStorage.setItem(this.localEditTimeKey(fileId), new Date().toISOString());
    emitSyncState();
  },

  getLocalEditTime(fileId: string): string | null {
    return localStorage.getItem(this.localEditTimeKey(fileId));
  },

  clearLocalEditTime(fileId: string): void {
    localStorage.removeItem(this.localEditTimeKey(fileId));
  },
};
