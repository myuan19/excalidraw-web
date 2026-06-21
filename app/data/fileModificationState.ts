import { isExcalidrawDraftDirty } from "./draftDirty";
import { DEFAULT_DOCUMENT_DISPLAY_NAME } from "./defaultDocumentName";
import { FileSyncState } from "./FileSyncState";
import { getClientTabId } from "./clientRequestContext";
import { isLocalDraftFileId } from "./localDraftFileId";
import { hashDocumentSnapshot, hashSceneSnapshot } from "./sceneHash";
import { clearTabFileDirty, markTabFileDirty } from "./tabFileDirtyState";
import { createLogger } from "../lib/logger";

import {
  getMindMapRootText,
  isMindMapSingleRootOnly,
  type MindMapDocumentData,
} from "./formats/MindMapAdapter";

import type { ManagedDocument } from "./documentTypes";
import type { ForkSceneSnapshot } from "./forkFileTypes";

const log = createLogger({ module: "fileModification" });

function hash8(hash: string | null | undefined): string | null {
  return hash ? hash.slice(0, 8) : null;
}

function logState(
  event: string,
  fileId: string | null,
  kind: string | null | undefined,
  state: FileModificationState,
  extra?: Record<string, unknown>,
): void {
  log.info(event, {
    clientTabId: getClientTabId(),
    fileId8: fileId ? fileId.slice(0, 8) : null,
    kind: kind ?? null,
    modified: state.modified,
    draftStatus: state.draftStatus,
    shouldPromptOnLeave: state.shouldPromptOnLeave,
    shouldMarkLocalDraftEdited: state.shouldMarkLocalDraftEdited,
    contentHash8: hash8(state.contentHash),
    baselineHash8: hash8(state.baselineHash),
    ...extra,
  });
}
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
    const state = toState(null, false, null, null);
    logState("read-stored", null, kind, state);
    return state;
  }
  const baselineHash = FileSyncState.getBaselineHash(fileId);
  const draftHash = FileSyncState.getDraftHash(fileId);
  if (isLocalDraftFileId(fileId)) {
    const state = toState(
      fileId,
      readStoredLocalDraftModified(fileId, kind),
      draftHash,
      baselineHash,
    );
    logState("read-stored", fileId, kind, state, { localDraft: true });
    return state;
  }
  const state = toState(
    fileId,
    FileSyncState.hasUnsavedChanges(fileId),
    draftHash,
    baselineHash,
  );
  logState("read-stored", fileId, kind, state, { localDraft: false });
  return state;
}

export function evaluateCurrentFileModificationState(opts: {
  fileId: string | null;
  kind: string;
  mindMapDocument?: ManagedDocument<MindMapDocumentData> | null;
  excalidrawScene?: ForkSceneSnapshot | null;
}): FileModificationState {
  const { fileId, kind } = opts;
  if (!fileId) {
    const state = toState(null, false, null, null);
    logState("evaluate-current", null, kind, state);
    return state;
  }

  const baselineHash = FileSyncState.getBaselineHash(fileId);
  if (kind === "mindmap" && opts.mindMapDocument) {
    const contentHash = hashDocumentSnapshot(opts.mindMapDocument);
    const modified = isLocalDraftFileId(fileId)
      ? !isMindMapTemplateDocument(opts.mindMapDocument)
      : baselineHash
      ? contentHash !== baselineHash
      : FileSyncState.hasUnsavedChanges(fileId);
    const state = toState(fileId, modified, contentHash, baselineHash);
    logState("evaluate-current", fileId, kind, state, {
      localDraft: isLocalDraftFileId(fileId),
      hadBaseline: !!baselineHash,
    });
    return state;
  }

  if (kind === "excalidraw" && opts.excalidrawScene) {
    const contentHash = hashSceneSnapshot(opts.excalidrawScene);
    if (!isExcalidrawDraftDirty(opts.excalidrawScene)) {
      const state = toState(fileId, false, contentHash, baselineHash);
      logState("evaluate-current", fileId, kind, state, {
        localDraft: isLocalDraftFileId(fileId),
        hadBaseline: !!baselineHash,
        templateScene: true,
      });
      return state;
    }
    const modified = isLocalDraftFileId(fileId)
      ? true
      : baselineHash
      ? contentHash !== baselineHash
      : FileSyncState.hasUnsavedChanges(fileId);
    const state = toState(fileId, modified, contentHash, baselineHash);
    logState("evaluate-current", fileId, kind, state, {
      localDraft: isLocalDraftFileId(fileId),
      hadBaseline: !!baselineHash,
    });
    return state;
  }

  const state = readStoredFileModificationState(fileId, kind);
  logState("evaluate-current:fallback-stored", fileId, kind, state);
  return state;
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
  logState("apply", fileId, null, state, {
    clearLocalCacheWhenSynced: !!opts.clearLocalCacheWhenSynced,
  });
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
