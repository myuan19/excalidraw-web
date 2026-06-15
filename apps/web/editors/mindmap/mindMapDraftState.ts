import { evaluateCurrentFileModificationState } from "../../data/fileModificationState";
import { FileSyncState } from "../../data/FileSyncState";
import { isLocalDraftFileId } from "../../data/localDraftFileId";
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
 * 初始化阶段：以 iframe 规范化后的文档作为服务器基线（baseline = draft）。
 * 用于打开文件后 native 推送的 draft，避免主题压缩等程序化变更误报未保存。
 */
export function adoptMindMapNativeBaseline(
  fileId: string,
  document: MindMapSaveDocument,
): void {
  if (isLocalDraftFileId(fileId)) {
    return;
  }
  recordMindMapPersisted(fileId, document);
}

/**
 * native 已通知有编辑，但最新完整文档快照还没到达宿主。
 * 先保守标记为草稿，等后续 saveMindMapData / 保存快照到达后再用真实 hash 对齐。
 */
export function markMindMapNativeDirtyPending(fileId: string): boolean {
  const baselineHash = FileSyncState.getBaselineHash(fileId);
  const pendingHash = `${NATIVE_DIRTY_PENDING_HASH_PREFIX}${
    baselineHash ?? "no-baseline"
  }`;
  if (FileSyncState.getDraftHash(fileId) === pendingHash) {
    return false;
  }
  FileSyncState.setDraftHash(fileId, pendingHash);
  FileSyncState.setLocalEditTime(fileId);
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
  if (!isLocalDraftFileId(fileId) && state.contentHash) {
    FileSyncState.alignHashes(fileId, state.contentHash);
    FileSyncState.clearLocalEditTime(fileId);
  }
  return true;
}
