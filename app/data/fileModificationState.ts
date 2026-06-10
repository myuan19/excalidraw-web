import { isExcalidrawDraftDirty } from "./draftDirty";
import { DEFAULT_DOCUMENT_DISPLAY_NAME } from "./defaultDocumentName";
import { FileSyncState } from "./FileSyncState";
import { isLocalDraftFileId } from "./localDraftFileId";
import { hashDocumentSnapshot, hashSceneSnapshot } from "./sceneHash";

import type { ManagedDocument } from "./documentTypes";
import {
  getMindMapRootText,
  isMindMapSingleRootOnly,
  type MindMapDocumentData,
} from "./formats/MindMapAdapter";
import type { ForkSceneSnapshot } from "./forkFileTypes";

export type FileModificationDraftStatus = "idle" | "draft" | "synced";

export type FileModificationState = {
  modified: boolean;
  draftStatus: FileModificationDraftStatus;
  shouldPromptOnLeave: boolean;
  shouldMarkLocalDraftEdited: boolean;
  contentHash: string | null;
  baselineHash: string | null;
};

function toState(
  fileId: string | null,
  modified: boolean,
  contentHash: string | null,
  baselineHash: string | null,
): FileModificationState {
  const hasFile = !!fileId;
  return {
    modified,
    draftStatus: !hasFile ? "idle" : modified ? "draft" : "synced",
    shouldPromptOnLeave: hasFile && modified,
    shouldMarkLocalDraftEdited:
      !!fileId && isLocalDraftFileId(fileId) && modified,
    contentHash,
    baselineHash,
  };
}

export function isMindMapTemplateDocument(document: unknown): boolean {
  if (!isMindMapSingleRootOnly(document)) {
    return false;
  }
  const data =
    (document as { data?: MindMapDocumentData } | null)?.data ??
    (document as MindMapDocumentData);
  return getMindMapRootText(data) === DEFAULT_DOCUMENT_DISPLAY_NAME;
}

export function isLocalDraftSnapshotModified(
  kind: string | null | undefined,
  snapshot: unknown,
): boolean {
  if (kind === "mindmap") {
    const document = (snapshot as { document?: unknown } | null)?.document ?? snapshot;
    return !isMindMapTemplateDocument(document);
  }
  return isExcalidrawDraftDirty(snapshot as ForkSceneSnapshot | null);
}

export function readStoredLocalDraftModified(
  fileId: string,
  kind: string | null | undefined,
): boolean {
  if (FileSyncState.hasUnsavedChanges(fileId)) {
    return true;
  }
  const cache = FileSyncState.getLocalCache(fileId);
  if (cache) {
    return isLocalDraftSnapshotModified(kind, cache);
  }
  return false;
}

export function readStoredFileModificationState(
  fileId: string | null,
  kind?: string | null,
): FileModificationState {
  if (!fileId) {
    return toState(null, false, null, null);
  }
  const baselineHash = FileSyncState.getBaselineHash(fileId);
  const draftHash = FileSyncState.getDraftHash(fileId);
  if (isLocalDraftFileId(fileId)) {
    return toState(
      fileId,
      readStoredLocalDraftModified(fileId, kind),
      draftHash,
      baselineHash,
    );
  }
  return toState(
    fileId,
    FileSyncState.hasUnsavedChanges(fileId),
    draftHash,
    baselineHash,
  );
}

export function evaluateCurrentFileModificationState(opts: {
  fileId: string | null;
  kind: string;
  mindMapDocument?: ManagedDocument<MindMapDocumentData> | null;
  excalidrawScene?: ForkSceneSnapshot | null;
}): FileModificationState {
  const { fileId, kind } = opts;
  if (!fileId) {
    return toState(null, false, null, null);
  }

  const baselineHash = FileSyncState.getBaselineHash(fileId);
  if (kind === "mindmap" && opts.mindMapDocument) {
    const contentHash = hashDocumentSnapshot(opts.mindMapDocument);
    const modified = isLocalDraftFileId(fileId)
      ? !isMindMapTemplateDocument(opts.mindMapDocument)
      : baselineHash
        ? contentHash !== baselineHash
        : FileSyncState.hasUnsavedChanges(fileId);
    return toState(fileId, modified, contentHash, baselineHash);
  }

  if (kind === "excalidraw" && opts.excalidrawScene) {
    const contentHash = hashSceneSnapshot(opts.excalidrawScene);
    const modified = isLocalDraftFileId(fileId)
      ? isExcalidrawDraftDirty(opts.excalidrawScene)
      : baselineHash
        ? contentHash !== baselineHash
        : FileSyncState.hasUnsavedChanges(fileId);
    return toState(fileId, modified, contentHash, baselineHash);
  }

  return readStoredFileModificationState(fileId, kind);
}
