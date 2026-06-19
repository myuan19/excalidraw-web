import { FileSyncState } from "./FileSyncState";
import {
  clearDocumentSessionVersion,
  getDocumentSessionVersion,
  setDocumentSessionVersion,
} from "./documentSessionVersion";
import { logDocumentVersion } from "./documentVersionLog";

import type { ServerFileHash } from "./ServerSync";

export type ListFileHashesFn = () => Promise<ServerFileHash[]>;

function findServerHashEntry(
  fileId: string,
  hashes: ServerFileHash[],
): ServerFileHash | undefined {
  return hashes.find((row) => row.id === fileId);
}

function updateLocalCacheServerMeta(
  fileId: string,
  entry: { content_sha256?: string | null; version?: number },
  reason: string,
): void {
  const local = FileSyncState.getLocalCache(fileId);
  if (!local) {
    return;
  }

  const nextMeta = {
    ...(local.meta ?? {}),
    ...(entry.content_sha256
      ? { serverContentSha256: entry.content_sha256 }
      : {}),
    ...(typeof entry.version === "number"
      ? { serverVersion: entry.version }
      : {}),
  };
  const prevVersion = local.meta?.serverVersion ?? null;
  const prevSha = local.meta?.serverContentSha256 ?? null;
  if (
    prevVersion === nextMeta.serverVersion &&
    prevSha === nextMeta.serverContentSha256
  ) {
    return;
  }

  FileSyncState.setServerSyncedLocalCache(fileId, {
    ...local,
    meta: nextMeta,
  });
  logDocumentVersion({
    action: "cache-meta",
    fileId,
    reason,
    cacheVersion: nextMeta.serverVersion ?? null,
    serverVersion: typeof entry.version === "number" ? entry.version : null,
    sessionVersion: getDocumentSessionVersion(fileId),
  });
}

function shouldSkipUnknownDraftBase(
  fileId: string,
  opts: {
    hasUnsavedChanges: boolean;
    cachedServerSha?: string | null;
    reason: string;
    serverVersion?: number | null;
  },
): boolean {
  if (!opts.hasUnsavedChanges || opts.cachedServerSha) {
    return false;
  }
  logDocumentVersion({
    action: "open-init",
    fileId,
    reason: `${opts.reason}:draft-base-unknown`,
    serverVersion: opts.serverVersion ?? null,
  });
  return true;
}

function shouldSkipUnappliedRemoteSha(
  fileId: string,
  opts: {
    cachedServerSha?: string | null;
    remoteSha?: string | null;
    reason: string;
    serverVersion?: number | null;
  },
): boolean {
  if (!opts.remoteSha || opts.cachedServerSha === opts.remoteSha) {
    return false;
  }
  clearDocumentSessionVersion(fileId, `${opts.reason}:remote-sha-unapplied`);
  logDocumentVersion({
    action: "hash-list",
    fileId,
    reason: `${opts.reason}:remote-sha-unapplied`,
    serverVersion: opts.serverVersion ?? null,
    sessionVersion: getDocumentSessionVersion(fileId),
  });
  return true;
}

export function applyServerFileSessionVersion(
  fileId: string,
  version: unknown,
  reason: string,
): void {
  setDocumentSessionVersion(fileId, version, {
    reason,
    serverVersion: typeof version === "number" ? version : null,
    cacheVersion: typeof version === "number" ? version : null,
  });
}

/**
 * cache meta 缺失 session 时，用 hash-list 补版本。
 * 有未保存修改且 cache 正文 sha 与服务器不一致时，不猜测基线（避免 silent overwrite）。
 */
export async function supplementSessionVersionIfMissing(
  fileId: string,
  opts: {
    listFileHashes: ListFileHashesFn;
    hasUnsavedChanges: boolean;
    cachedServerSha?: string | null;
    reason: string;
  },
): Promise<boolean> {
  if (getDocumentSessionVersion(fileId) != null) {
    return true;
  }

  let entry: ServerFileHash | undefined;
  try {
    const hashes = await opts.listFileHashes();
    entry = findServerHashEntry(fileId, hashes);
  } catch {
    logDocumentVersion({
      action: "open-init",
      fileId,
      reason: `${opts.reason}:hash-list-failed`,
    });
    return false;
  }

  if (typeof entry?.version !== "number") {
    logDocumentVersion({
      action: "open-init",
      fileId,
      reason: `${opts.reason}:no-server-version`,
    });
    return false;
  }

  const remoteSha = entry.content_sha256 ?? null;
  if (
    shouldSkipUnappliedRemoteSha(fileId, {
      cachedServerSha: opts.cachedServerSha,
      remoteSha,
      reason: opts.reason,
      serverVersion: entry.version,
    })
  ) {
    return false;
  }
  if (
    shouldSkipUnknownDraftBase(fileId, {
      hasUnsavedChanges: opts.hasUnsavedChanges,
      cachedServerSha: opts.cachedServerSha,
      reason: opts.reason,
      serverVersion: entry.version,
    })
  ) {
    return false;
  }
  if (
    opts.hasUnsavedChanges &&
    opts.cachedServerSha &&
    remoteSha &&
    opts.cachedServerSha !== remoteSha
  ) {
    logDocumentVersion({
      action: "open-init",
      fileId,
      reason: `${opts.reason}:draft-diverged`,
      serverVersion: entry.version,
      cacheVersion: opts.cachedServerSha ? null : undefined,
    });
    return false;
  }

  setDocumentSessionVersion(fileId, entry.version, {
    reason: opts.reason,
    serverVersion: entry.version,
  });
  updateLocalCacheServerMeta(fileId, entry, opts.reason);
  logDocumentVersion({
    action: "hash-list",
    fileId,
    reason: opts.reason,
    serverVersion: entry.version,
    sessionVersion: entry.version,
  });
  return true;
}

/**
 * 内容 304 只能说明正文 SHA 没变，不能证明本地 cache meta 的 version 仍是最新。
 * 用 hash-list 对齐当前服务器 version，避免用 stale sessionVersion 发 PUT。
 */
export async function reconcileSessionVersionFromHashList(
  fileId: string,
  opts: {
    listFileHashes: ListFileHashesFn;
    hasUnsavedChanges: boolean;
    cachedServerSha?: string | null;
    reason: string;
  },
): Promise<boolean> {
  let entry: ServerFileHash | undefined;
  try {
    const hashes = await opts.listFileHashes();
    entry = findServerHashEntry(fileId, hashes);
  } catch {
    logDocumentVersion({
      action: "open-init",
      fileId,
      reason: `${opts.reason}:hash-list-failed`,
    });
    return false;
  }

  if (typeof entry?.version !== "number") {
    logDocumentVersion({
      action: "open-init",
      fileId,
      reason: `${opts.reason}:no-server-version`,
    });
    return false;
  }

  const remoteSha = entry.content_sha256 ?? null;
  if (
    shouldSkipUnappliedRemoteSha(fileId, {
      cachedServerSha: opts.cachedServerSha,
      remoteSha,
      reason: opts.reason,
      serverVersion: entry.version,
    })
  ) {
    return false;
  }
  if (
    shouldSkipUnknownDraftBase(fileId, {
      hasUnsavedChanges: opts.hasUnsavedChanges,
      cachedServerSha: opts.cachedServerSha,
      reason: opts.reason,
      serverVersion: entry.version,
    })
  ) {
    return false;
  }
  if (
    opts.hasUnsavedChanges &&
    opts.cachedServerSha &&
    remoteSha &&
    opts.cachedServerSha !== remoteSha
  ) {
    logDocumentVersion({
      action: "open-init",
      fileId,
      reason: `${opts.reason}:draft-diverged`,
      serverVersion: entry.version,
      cacheVersion: null,
    });
    return false;
  }

  if (remoteSha) {
    FileSyncState.setServerHash(fileId, remoteSha);
  }
  setDocumentSessionVersion(fileId, entry.version, {
    reason: opts.reason,
    serverVersion: entry.version,
  });
  updateLocalCacheServerMeta(fileId, entry, opts.reason);
  logDocumentVersion({
    action: "hash-list",
    fileId,
    reason: opts.reason,
    serverVersion: entry.version,
    sessionVersion: entry.version,
  });
  return true;
}

export function updateLocalCacheServerVersionMeta(
  fileId: string,
  entry: { content_sha256?: string | null; version?: number },
  reason: string,
): void {
  updateLocalCacheServerMeta(fileId, entry, reason);
}

export async function ensureSessionVersionAfterCacheOpen(
  fileId: string,
  opts: {
    listFileHashes: ListFileHashesFn;
    cacheVersion?: number | null;
    hasUnsavedChanges: boolean;
    cachedServerSha?: string | null;
    reason: string;
  },
): Promise<void> {
  const reconciled = await reconcileSessionVersionFromHashList(fileId, {
    listFileHashes: opts.listFileHashes,
    hasUnsavedChanges: opts.hasUnsavedChanges,
    cachedServerSha:
      opts.cachedServerSha ??
      FileSyncState.getLocalCache(fileId)?.meta?.serverContentSha256 ??
      FileSyncState.getServerHash(fileId),
    reason: `${opts.reason}:reconcile`,
  });
  if (reconciled) {
    return;
  }

  if (typeof opts.cacheVersion === "number") {
    setDocumentSessionVersion(fileId, opts.cacheVersion, {
      reason: `${opts.reason}:cache-fallback`,
      cacheVersion: opts.cacheVersion,
      serverVersion: opts.cacheVersion,
    });
  }

  if (getDocumentSessionVersion(fileId) != null) {
    return;
  }

  await supplementSessionVersionIfMissing(fileId, {
    listFileHashes: opts.listFileHashes,
    hasUnsavedChanges: opts.hasUnsavedChanges,
    cachedServerSha:
      opts.cachedServerSha ??
      FileSyncState.getLocalCache(fileId)?.meta?.serverContentSha256 ??
      FileSyncState.getServerHash(fileId),
    reason: `${opts.reason}:supplement`,
  });
}
