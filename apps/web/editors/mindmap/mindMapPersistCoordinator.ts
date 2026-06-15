import { FileSyncState } from "../../data/FileSyncState";
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
  opts?: { serverContentSha256?: string },
): void {
  if (isLocalDraftFileId(fileId)) {
    return;
  }
  noteMindMapPersistedSnapshot(fileId, document);
  const existing = FileSyncState.getLocalCache(fileId);
  const serverSha =
    opts?.serverContentSha256 ??
    existing?.meta?.serverContentSha256 ??
    undefined;
  FileSyncState.setLocalCache(
    fileId,
    toMindMapLocalCacheRecord(document, serverSha),
  );
  FileSyncState.alignHashes(fileId, hashDocumentSnapshot(document));
  if (opts?.serverContentSha256) {
    FileSyncState.setServerHash(fileId, opts.serverContentSha256);
  }
  FileSyncState.clearLocalEditTime(fileId);
  clearTabFileDirty(fileId);
  debugMindMapPersist("recordMindMapPersisted", {
    fileId8: fileId.slice(0, 8),
    serverSha8: opts?.serverContentSha256?.slice(0, 8) ?? null,
    contentHash8: hashDocumentSnapshot(document).slice(0, 8),
    sampleNode: findFirstRichMindMapNodeSummary(document.data),
  });
}
