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
import { notifyLocalDraftEdited } from "./localDraftSessions";
import { clearTabFileDirty, markTabFileDirty } from "./tabFileDirtyState";

import type { ManagedDocument } from "./documentTypes";
import type { MindMapDocumentData } from "./formats/MindMapAdapter";
import type { ForkSceneSnapshot } from "./forkFileTypes";

export function cacheExcalidrawDraft(
  fileId: string,
  scene: ForkSceneSnapshot,
): string {
  const canonicalScene = canonicalizeExcalidrawSceneFileName(fileId, scene);
  const hash = hashSceneSnapshot(canonicalScene);
  FileSyncState.setLocalCache(fileId, {
    elements: canonicalScene.elements,
    appState: canonicalScene.appState ?? {},
    files: canonicalScene.files ?? {},
    deltas: [],
  });
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
  FileSyncState.alignHashes(fileId, hash);
  FileSyncState.clearLocalEditTime(fileId);
  clearTabFileDirty(fileId);
  markEditSessionClosedCleanly(fileId);
  traceMindMapOperation("draft.markDocumentCommitted.after", {
    fileId8: fileId.slice(0, 8),
    hash,
    fileStateAfter: readMindMapTraceFileState(fileId),
  });
}
