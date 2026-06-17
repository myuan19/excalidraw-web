import { isExcalidrawDraftDirty } from "./draftDirty";
import { DEFAULT_DOCUMENT_DISPLAY_NAME } from "./defaultDocumentName";
import { FileSyncState } from "./FileSyncState";
import { isLocalDraftFileId } from "./localDraftFileId";
import { hashDocumentSnapshot, hashSceneSnapshot } from "./sceneHash";
import { clearTabFileDirty, markTabFileDirty } from "./tabFileDirtyState";

import {
  getMindMapRootText,
  isMindMapSingleRootOnly,
  type MindMapDocumentData,
} from "./formats/MindMapAdapter";

import type { ManagedDocument } from "./documentTypes";
import type { ForkSceneSnapshot } from "./forkFileTypes";
import type { ArchiveEntry } from "./ServerSync";

export type FileModificationDraftStatus = "idle" | "draft" | "synced";

export type FileModificationState = {
  modified: boolean;
  draftStatus: FileModificationDraftStatus;
  shouldPromptOnLeave: boolean;
  shouldMarkLocalDraftEdited: boolean;
  contentHash: string | null;
  baselineHash: string | null;
};

export type ApplyFileModificationStateOptions = {
  /** Server files keep local cache for offline/thumb uses; leave paths may clear it. */
  clearLocalCacheWhenSynced?: boolean;
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
    const document =
      (snapshot as { document?: unknown } | null)?.document ?? snapshot;
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

/** 与本地/服务器同步判定相同：同类型内容指纹一致即视为同一版本。 */
export function areFileContentFingerprintsEqual(
  contentHash: string | null | undefined,
  referenceHash: string | null | undefined,
): boolean {
  return !!contentHash && !!referenceHash && contentHash === referenceHash;
}

/**
 * 存档覆盖判定（恢复前是否需提示先存档；手动存档前是否提示重复）。
 *
 * 两层身份，与现有同步架构一致：
 * - 客户端指纹（draft/baseline）：{@link FileModificationState.modified}
 * - 服务端快照 SHA（{@link FileSyncState.getServerHash}）：与 archives.content_sha256 同源
 */
export type ArchiveCoverage = {
  /** 当前编辑内容与上次保存基线一致（客户端指纹层）。 */
  isSyncedWithBaseline: boolean;
  /** 服务端最新快照 SHA 已出现在存档列表中。 */
  isServerSnapshotArchived: boolean;
  /** 可直接恢复，无需「先存档」提示。 */
  canRestoreWithoutArchivePrompt: boolean;
};

/** 存档面板「存档」按钮的门禁：先保存 / 重复确认 / 直接存档。 */
export type ManualArchiveGate = "save-first" | "prompt-duplicate" | "archive";

export function evaluateArchiveCoverage(
  fileId: string,
  modification: FileModificationState,
  archives: ArchiveEntry[],
): ArchiveCoverage {
  const isSyncedWithBaseline = !modification.modified;
  const serverSha = FileSyncState.getServerHash(fileId);
  const isServerSnapshotArchived =
    !!serverSha &&
    archives.some((archive) => archive.content_sha256 === serverSha);

  return {
    isSyncedWithBaseline,
    isServerSnapshotArchived,
    canRestoreWithoutArchivePrompt:
      isSyncedWithBaseline && isServerSnapshotArchived,
  };
}

/** 根据当前覆盖态决定手动存档下一步（与 {@link evaluateArchiveCoverage} 同一入口）。 */
export function evaluateManualArchiveGate(
  fileId: string,
  modification: FileModificationState,
  archives: ArchiveEntry[],
): ManualArchiveGate {
  const coverage = evaluateArchiveCoverage(fileId, modification, archives);
  if (!coverage.isSyncedWithBaseline) {
    return "save-first";
  }
  if (coverage.isServerSnapshotArchived) {
    return "prompt-duplicate";
  }
  return "archive";
}

/**
 * Applies the canonical modification result to FileSyncState and tab-local dirty
 * state. UI badges, leave guards, and background refresh then observe the same
 * source of truth instead of each editor hand-writing hash state differently.
 */
export function applyFileModificationState(
  fileId: string,
  state: FileModificationState,
  opts: ApplyFileModificationStateOptions = {},
): void {
  if (state.modified) {
    if (state.contentHash) {
      FileSyncState.setDraftHash(fileId, state.contentHash);
    }
    FileSyncState.setLocalEditTime(fileId);
    markTabFileDirty(fileId);
    return;
  }

  clearTabFileDirty(fileId);
  FileSyncState.clearLocalEditTime(fileId);

  if (state.contentHash && state.baselineHash) {
    FileSyncState.alignHashes(fileId, state.contentHash);
  } else if (state.baselineHash) {
    FileSyncState.setDraftHash(fileId, state.baselineHash);
  } else {
    FileSyncState.clearDraftHash(fileId);
  }

  if (opts.clearLocalCacheWhenSynced || isLocalDraftFileId(fileId)) {
    FileSyncState.clearLocalCache(fileId);
  }
}
