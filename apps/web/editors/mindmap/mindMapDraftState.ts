import {
  applyFileModificationState,
  evaluateCurrentFileModificationState,
} from "../../data/fileModificationState";
import { FileSyncState } from "../../data/FileSyncState";
import { isLocalDraftFileId } from "../../data/localDraftFileId";
import { markTabFileDirty } from "../../data/tabFileDirtyState";
import { recordMindMapPersisted } from "./mindMapPersistCoordinator";

import type { ManagedDocument } from "../../data/documentTypes";
import type { MindMapDocumentData } from "../../data/formats/MindMapAdapter";

export type MindMapSaveDocument = ManagedDocument<MindMapDocumentData>;

/** iframe 初始化阶段与宿主 settle 结束共用的静默窗口（须与 takeoverShell 中 delayMs 一致） */
export const NATIVE_HYDRATE_SETTLE_MS = 2500;
const NATIVE_DIRTY_PENDING_HASH_PREFIX = "mindmap-native-dirty-pending:";

export function getMindMapModificationState(
  fileId: string,
  document: MindMapSaveDocument,
) {
  return evaluateCurrentFileModificationState({
    fileId,
    kind: "mindmap",
    mindMapDocument: document,
  });
}

/**
 * 初始化阶段：以 iframe 规范化后的文档作为基线写入 modification 状态。
 * 服务端文件走 persistCoordinator；local-draft 走 applyFileModificationState。
 */
export function adoptMindMapNativeBaseline(
  fileId: string,
  document: MindMapSaveDocument,
): void {
  if (isLocalDraftFileId(fileId)) {
    const state = getMindMapModificationState(fileId, document);
    applyFileModificationState(fileId, state, {
      reason: "mindMapDraftState.adoptNativeBaseline:local-draft",
    });
    return;
  }
  recordMindMapPersisted(fileId, document);
}

/**
 * native 已通知有编辑，但最新完整文档快照还没到达宿主。
 * 先保守标记为草稿，等后续 saveMindMapData / 保存快照到达后再用真实 hash 对齐。
 */
export function markMindMapNativeDirtyPending(fileId: string): boolean {
  if (isMindMapNativeDirtyPending(fileId)) {
    return false;
  }
  if (FileSyncState.hasUnsavedChanges(fileId)) {
    markTabFileDirty(fileId);
    FileSyncState.setLocalEditTime(fileId);
    return false;
  }
  const baselineHash = FileSyncState.getBaselineHash(fileId);
  const pendingHash = `${NATIVE_DIRTY_PENDING_HASH_PREFIX}${
    baselineHash ?? "no-baseline"
  }`;
  if (FileSyncState.getDraftHash(fileId) === pendingHash) {
    return false;
  }
  FileSyncState.setDraftHash(fileId, pendingHash);
  FileSyncState.setLocalEditTime(fileId);
  markTabFileDirty(fileId);
  return true;
}

export function isMindMapNativeDirtyPending(fileId: string): boolean {
  return (
    FileSyncState.getDraftHash(fileId)?.startsWith(
      NATIVE_DIRTY_PENDING_HASH_PREFIX,
    ) ?? false
  );
}

/**
 * hydrate settle 结束时若用户已编辑，不得把 iframe 快照当作已保存基线对齐。
 * 否则会表现为「首次编辑变黄后立刻变绿」，且不会触发真正的服务器保存。
 */
export function shouldSkipMindMapHydrateSettleBaselineAdopt(
  fileId: string,
  document?: MindMapSaveDocument | null,
): boolean {
  if (document) {
    return getMindMapModificationState(fileId, document).modified;
  }
  return (
    FileSyncState.hasUnsavedChanges(fileId) ||
    isMindMapNativeDirtyPending(fileId)
  );
}

/**
 * 编辑阶段：文档与基线一致时对齐 hash 并清除误报。
 * @returns true 表示已与基线一致（无需标脏）
 */
export function clearMindMapDraftIfUnchanged(
  fileId: string,
  document: MindMapSaveDocument,
): boolean {
  const state = getMindMapModificationState(fileId, document);
  if (state.modified) {
    return false;
  }
  applyFileModificationState(fileId, state, {
    reason: "mindMapDraftState.clearIfUnchanged",
  });
  return true;
}
