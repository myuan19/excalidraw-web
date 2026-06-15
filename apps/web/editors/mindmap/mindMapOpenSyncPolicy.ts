export type MindMapOpenSyncDecision = {
  refresh: boolean;
  reason:
    | "has-unsaved-changes"
    | "no-remote-hash"
    | "local-server-hash-stale"
    | "cache-sha-missing"
    | "cache-sha-stale"
    | "cache-aligned";
};

/**
 * MindMap 重开时：本地缓存正文是否与服务器版本一致。
 * 使用服务器 content_sha256 作为权威版本号（与 listFileHashes 对齐）。
 */
export function explainRefreshCacheOnOpen(opts: {
  hasUnsavedChanges: boolean;
  remoteServerHash: string | null | undefined;
  cachedServerSha: string | null | undefined;
  localServerHash: string | null | undefined;
}): MindMapOpenSyncDecision {
  if (opts.hasUnsavedChanges) {
    return { refresh: false, reason: "has-unsaved-changes" };
  }
  if (!opts.remoteServerHash) {
    return { refresh: false, reason: "no-remote-hash" };
  }
  if (opts.localServerHash !== opts.remoteServerHash) {
    return { refresh: true, reason: "local-server-hash-stale" };
  }
  if (!opts.cachedServerSha) {
    return { refresh: true, reason: "cache-sha-missing" };
  }
  if (opts.cachedServerSha !== opts.remoteServerHash) {
    return { refresh: true, reason: "cache-sha-stale" };
  }
  return { refresh: false, reason: "cache-aligned" };
}

export function shouldRefreshCacheOnOpen(
  opts: Parameters<typeof explainRefreshCacheOnOpen>[0],
): boolean {
  return explainRefreshCacheOnOpen(opts).refresh;
}
