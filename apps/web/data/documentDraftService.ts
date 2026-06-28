import { traceFileListSortOrder } from "../lib/issueDiagTrace";
import { FileSyncState } from "./FileSyncState";
import { hashDocumentSnapshot, hashSceneSnapshot } from "./sceneHash";
import {
  readMindMapTraceFileState,
  summarizeMindMapTraceDocument,
  traceMindMapOperation,
} from "./mindMapOperationTrace";
import {
  markEditSessionClosedCleanly,
  markEditSessionEdited,
} from "./editSessionService";
import { canonicalizeExcalidrawSceneFileName } from "./excalidrawFileNameAuthority";
import { isDebugRuntimeEnabled } from "./debugCapability";
import { notifyLocalDraftEdited } from "./localDraftSessions";
import { clearTabFileDirty, markTabFileDirty } from "./tabFileDirtyState";
import { traceIssueDiag } from "../lib/issueDiagTrace";

import type { ManagedDocument } from "./documentTypes";
import type { MindMapDocumentData } from "./formats/MindMapAdapter";
import type { ForkSceneSnapshot } from "./forkFileTypes";

export function cacheExcalidrawDraft(
  fileId: string,
  scene: ForkSceneSnapshot,
  opts?: { emit?: boolean },
): string {
  const totalStartedAt = performance.now();
  const canonicalStartedAt = performance.now();
  const canonicalScene = canonicalizeExcalidrawSceneFileName(fileId, scene);
  const canonicalMs = Math.round(performance.now() - canonicalStartedAt);
  const hashStartedAt = performance.now();
  const hash = hashSceneSnapshot(canonicalScene);
  const hashMs = Math.round(performance.now() - hashStartedAt);
  const cacheStartedAt = performance.now();
  FileSyncState.setLocalCache(
    fileId,
    {
      elements: canonicalScene.elements,
      appState: canonicalScene.appState ?? {},
      files: canonicalScene.files ?? {},
      deltas: [],
    },
    opts,
  );
  const localCacheMs = Math.round(performance.now() - cacheStartedAt);
  if (isDebugRuntimeEnabled()) {
    traceIssueDiag(
      "excalidraw.drag",
      "draft.cache",
      {
        fileId8: fileId.slice(0, 8),
        hash8: hash.slice(0, 8),
        elements: Array.isArray(canonicalScene.elements)
          ? canonicalScene.elements.length
          : null,
        files:
          canonicalScene.files && typeof canonicalScene.files === "object"
            ? Object.keys(canonicalScene.files).length
            : null,
        emitSyncState: opts?.emit !== false,
        canonicalMs,
        hashMs,
        localCacheMs,
        totalMs: Math.round(performance.now() - totalStartedAt),
      },
      hashMs > 16 || localCacheMs > 16 ? "fail" : "branch",
    );
  }
  return hash;
}

export function recordExcalidrawDraft(
  fileId: string,
  scene: ForkSceneSnapshot,
): string {
  const hash = cacheExcalidrawDraft(fileId, scene);
  FileSyncState.setDraftHash(fileId, hash);
  FileSyncState.setLocalEditTime(fileId);
  markTabFileDirty(fileId);
  markEditSessionEdited(fileId);
  notifyLocalDraftEdited(fileId);
  return hash;
}

export function toMindMapDraftCacheRecord(
  document: ManagedDocument<MindMapDocumentData>,
) {
  return {
    document,
    elements: undefined,
    appState: undefined,
    files: {},
    deltas: [],
  };
}

export function cacheMindMapDraft(
  fileId: string,
  document: ManagedDocument<MindMapDocumentData>,
): string {
  const hash = hashDocumentSnapshot(document);
  traceMindMapOperation("draft.cacheMindMapDraft.before", {
    fileId8: fileId.slice(0, 8),
    hash,
    document: summarizeMindMapTraceDocument(document),
    fileStateBefore: readMindMapTraceFileState(fileId),
  });
  FileSyncState.setLocalCache(fileId, toMindMapDraftCacheRecord(document));
  traceMindMapOperation("draft.cacheMindMapDraft.after", {
    fileId8: fileId.slice(0, 8),
    hash,
    fileStateAfter: readMindMapTraceFileState(fileId),
  });
  return hash;
}

export function recordMindMapDraft(
  fileId: string,
  document: ManagedDocument<MindMapDocumentData>,
): string {
  traceMindMapOperation("draft.recordMindMapDraft.start", {
    fileId8: fileId.slice(0, 8),
    document: summarizeMindMapTraceDocument(document),
    fileStateBefore: readMindMapTraceFileState(fileId),
  });
  const hash = cacheMindMapDraft(fileId, document);
  FileSyncState.setDraftHash(fileId, hash);
  FileSyncState.setLocalEditTime(fileId);
  markTabFileDirty(fileId);
  markEditSessionEdited(fileId);
  traceMindMapOperation("draft.recordMindMapDraft.after", {
    fileId8: fileId.slice(0, 8),
    hash,
    fileStateAfter: readMindMapTraceFileState(fileId),
  });
  return hash;
}

export function markDocumentCommitted(fileId: string, hash: string): void {
  traceMindMapOperation("draft.markDocumentCommitted.before", {
    fileId8: fileId.slice(0, 8),
    hash,
    fileStateBefore: readMindMapTraceFileState(fileId),
  });
  // Clear local edit time before alignHashes so sync-state listeners observe
  // synced thumbnail slots instead of stale draft policy.
  FileSyncState.clearLocalEditTime(fileId);
  if (isDebugRuntimeEnabled()) {
    traceFileListSortOrder("commit.clearLocalEditTime", {
      fileId8: fileId.slice(0, 8),
      hash8: hash.slice(0, 8),
    });
  }
  FileSyncState.alignHashes(fileId, hash);
  clearTabFileDirty(fileId);
  markEditSessionClosedCleanly(fileId);
  traceMindMapOperation("draft.markDocumentCommitted.after", {
    fileId8: fileId.slice(0, 8),
    hash,
    fileStateAfter: readMindMapTraceFileState(fileId),
  });
}
