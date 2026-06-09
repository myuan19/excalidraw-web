import { evaluateCurrentFileModificationState } from "../../data/fileModificationState";
import { FileSyncState } from "../../data/FileSyncState";
import { isLocalDraftFileId } from "../../data/localDraftFileId";
import { hashDocumentSnapshot } from "../../data/sceneHash";

import type { ManagedDocument } from "../../data/documentTypes";
import type { MindMapDocumentData } from "../../data/formats/MindMapAdapter";

export type MindMapSaveDocument = ManagedDocument<MindMapDocumentData>;

/** iframe 初始化阶段与宿主 settle 结束共用的静默窗口（须与 takeoverShell 中 delayMs 一致） */
export const NATIVE_HYDRATE_SETTLE_MS = 2500;

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
  FileSyncState.alignHashes(fileId, hashDocumentSnapshot(document));
  FileSyncState.clearLocalEditTime(fileId);
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
