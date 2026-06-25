import { FileSyncState } from "./FileSyncState";
import { hashDocumentSnapshot, hashSceneSnapshot } from "./sceneHash";

import type { ForkSceneSnapshot } from "./forkFileTypes";

function hashLocalCacheRecord(cache: unknown): string | null {
  if (!cache || typeof cache !== "object") {
    return null;
  }
  const record = cache as {
    document?: { kind?: string };
    elements?: unknown;
    meta?: { serverContentSha256?: string };
  };
  if (record.document?.kind === "mindmap") {
    return hashDocumentSnapshot(record.document);
  }
  if (Array.isArray(record.elements)) {
    return hashSceneSnapshot(cache as ForkSceneSnapshot);
  }
  return null;
}

/**
 * True when local cache matches the last committed client snapshot for `serverSha`.
 * Uses client-side fingerprints (baseline/cache hash), not raw server sha equality.
 */
export function isLocalCacheConsistentWithServerHash(
  fileId: string,
  serverSha: string | null | undefined,
): boolean {
  if (!serverSha) {
    return false;
  }
  const cache = FileSyncState.getLocalCache(fileId);
  if (!cache) {
    return false;
  }

  const cachedServerSha = cache.meta?.serverContentSha256;
  if (cachedServerSha && cachedServerSha !== serverSha) {
    return false;
  }

  const trackedServerHash = FileSyncState.getServerHash(fileId);
  if (trackedServerHash && trackedServerHash !== serverSha) {
    return false;
  }

  const baselineHash = FileSyncState.getBaselineHash(fileId);
  const cacheHash = hashLocalCacheRecord(cache);
  if (!cacheHash || !baselineHash) {
    return false;
  }
  return cacheHash === baselineHash;
}
