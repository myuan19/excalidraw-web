import { FileSyncState } from "./FileSyncState";
import {
  clearDocumentSessionVersion,
  getDocumentSessionVersion,
  setDocumentSessionVersion,
} from "./documentSessionVersion";
import { logDocumentVersion } from "./documentVersionLog";

import type { ServerFileHash } from "./ServerSync";

/**
 * Session version reconciliation for optimistic PUT saves.
 *
 * ## Responsibility
 * Maintains the in-memory `expectedVersion` token used by `ServerSync.saveFileImmediate`.
 * This is separate from content fingerprints (`FileSyncState` / `sceneHash`) and from
 * whether cached document bodies should reload (`editorOpenPhases`).
 *
 * ## Public entry (runtime)
 * Call `ensureSessionVersionAfterCacheOpen` at every open/save boundary:
 * - `loadEditorServerFile` local-cache recovery
 * - `ServerSync.getFile` 304 cache hit
 * - `ServerSync.saveFileImmediate` preflight
 * - `initializeExcalidrawScene.verifyExcalidrawRemoteAfterCachedOpen`
 *
 * Flow: reconcile from hash-list → cache-meta fallback → supplement if still empty.
 *
 * ## Lower-level exports
 * `reconcileSessionVersionFromHashList` / `supplementSessionVersionIfMissing` are composed
 * by `ensure` and covered by unit tests. Do not import them from editors or ServerSync.
 */
export type ListFileHashesFn = () => Promise<ServerFileHash[]>;

function findServerHashEntry(
  fileId: string,
  hashes: ServerFileHash[],
): ServerFileHash | undefined {
  return hashes.find((row) => row.id === fileId);
}

function updateLocalCacheServerMeta(
  fileId: string,
  entry: { content_sha256?: string | null; version?: number | null },
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

function applySessionVersionFromHashEntry(
  fileId: string,
  entry: ServerFileHash,
  opts: {
    hasUnsavedChanges: boolean;
    cachedServerSha?: string | null;
    reason: string;
    syncServerHash: boolean;
  },
): boolean {
  if (typeof entry.version !== "number") {
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

  if (opts.syncServerHash && remoteSha) {
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

async function loadHashListEntry(
  fileId: string,
  listFileHashes: ListFileHashesFn,
  reason: string,
): Promise<ServerFileHash | null | "failed"> {
  try {
    const hashes = await listFileHashes();
    return findServerHashEntry(fileId, hashes) ?? null;
  } catch {
    logDocumentVersion({
      action: "open-init",
      fileId,
      reason: `${reason}:hash-list-failed`,
    });
    return "failed";
  }
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

  const entry = await loadHashListEntry(fileId, opts.listFileHashes, opts.reason);
  if (entry === "failed") {
    return false;
  }
  if (entry == null) {
    logDocumentVersion({
      action: "open-init",
      fileId,
      reason: `${opts.reason}:no-server-version`,
    });
    return false;
  }

  return applySessionVersionFromHashEntry(fileId, entry, {
    hasUnsavedChanges: opts.hasUnsavedChanges,
    cachedServerSha: opts.cachedServerSha,
    reason: opts.reason,
    syncServerHash: false,
  });
}

export async function reconcileSessionVersionFromHashList(
  fileId: string,
  opts: {
    listFileHashes: ListFileHashesFn;
    hasUnsavedChanges: boolean;
    cachedServerSha?: string | null;
    reason: string;
  },
): Promise<boolean> {
  const entry = await loadHashListEntry(fileId, opts.listFileHashes, opts.reason);
  if (entry === "failed") {
    return false;
  }
  if (entry == null) {
    logDocumentVersion({
      action: "open-init",
      fileId,
      reason: `${opts.reason}:no-server-version`,
    });
    return false;
  }

  return applySessionVersionFromHashEntry(fileId, entry, {
    hasUnsavedChanges: opts.hasUnsavedChanges,
    cachedServerSha: opts.cachedServerSha,
    reason: opts.reason,
    syncServerHash: true,
  });
}

export function updateLocalCacheServerVersionMeta(
  fileId: string,
  entry: { content_sha256?: string | null; version?: number | null },
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
  const cachedServerSha =
    opts.cachedServerSha ??
    FileSyncState.getLocalCache(fileId)?.meta?.serverContentSha256 ??
    FileSyncState.getServerHash(fileId);

  const reconciled = await reconcileSessionVersionFromHashList(fileId, {
    listFileHashes: opts.listFileHashes,
    hasUnsavedChanges: opts.hasUnsavedChanges,
    cachedServerSha,
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
    cachedServerSha,
    reason: `${opts.reason}:supplement`,
  });
}
