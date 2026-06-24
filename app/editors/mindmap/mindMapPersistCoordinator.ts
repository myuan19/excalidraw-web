import { FileSyncState } from "../../data/FileSyncState";
import { getDocumentSessionVersion } from "../../data/documentSessionVersion";
import { logDocumentVersion } from "../../data/documentVersionLog";
import { isLocalDraftFileId } from "../../data/localDraftFileId";
import { hashDocumentSnapshot } from "../../data/sceneHash";
import { clearTabFileDirty } from "../../data/tabFileDirtyState";
import { noteMindMapPersistedSnapshot } from "./mindMapPersistedSnapshot";
import { toMindMapLocalCacheRecord } from "./mindMapLocalCacheRecord";
import {
  debugMindMapPersist,
  findFirstRichMindMapNodeSummary,
} from "./mindMapPersistDebug";

import type { MindMapSaveDocument } from "./mindMapDraftState";

/**
 * 保存成功或 hydrate 对齐后的统一写入口：快照、本地 cache、hash 键保持一致。
 */
export function recordMindMapPersisted(
  fileId: string,
  document: MindMapSaveDocument,
  opts?: {
    serverContentSha256?: string;
    serverVersion?: number;
    preserveDirty?: boolean;
  },
): void {
  if (isLocalDraftFileId(fileId)) {
    return;
  }
  noteMindMapPersistedSnapshot(fileId, document);
  const contentHash = hashDocumentSnapshot(document);
  if (opts?.preserveDirty) {
    FileSyncState.setBaselineHash(fileId, contentHash);
    if (opts.serverContentSha256) {
      FileSyncState.setServerHash(fileId, opts.serverContentSha256);
    }
    debugMindMapPersist("recordMindMapPersisted preserve dirty", {
      fileId8: fileId.slice(0, 8),
      serverSha8: opts.serverContentSha256?.slice(0, 8) ?? null,
      serverVersion: opts.serverVersion ?? null,
      contentHash8: contentHash.slice(0, 8),
      draftHash8: FileSyncState.getDraftHash(fileId)?.slice(0, 8) ?? null,
      sampleNode: findFirstRichMindMapNodeSummary(document.data),
    });
    return;
  }
  const existing = FileSyncState.getLocalCache(fileId);
  const serverSha =
    opts?.serverContentSha256 ??
    existing?.meta?.serverContentSha256 ??
    undefined;
  const serverVersion =
    opts?.serverVersion ?? existing?.meta?.serverVersion ?? undefined;
  FileSyncState.setServerSyncedLocalCache(
    fileId,
    toMindMapLocalCacheRecord(document, serverSha, serverVersion),
  );
  if (typeof opts?.serverVersion === "number") {
    logDocumentVersion({
      action: "cache-meta",
      fileId,
      reason: "recordMindMapPersisted",
      cacheVersion: serverVersion,
      serverVersion: opts.serverVersion,
      sessionVersion: getDocumentSessionVersion(fileId),
    });
  }
  FileSyncState.alignHashes(fileId, contentHash);
  if (opts?.serverContentSha256) {
    FileSyncState.setServerHash(fileId, opts.serverContentSha256);
  }
  FileSyncState.clearLocalEditTime(fileId);
  clearTabFileDirty(fileId);
  debugMindMapPersist("recordMindMapPersisted", {
    fileId8: fileId.slice(0, 8),
    serverSha8: opts?.serverContentSha256?.slice(0, 8) ?? null,
    serverVersion: opts?.serverVersion ?? null,
    contentHash8: contentHash.slice(0, 8),
    sampleNode: findFirstRichMindMapNodeSummary(document.data),
  });
}
