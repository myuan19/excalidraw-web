import { hashDocumentSnapshot } from "../../data/sceneHash";

import type { MindMapSaveDocument } from "./mindMapDraftState";

/**
 * 最近一次成功保存或与服务器基线对齐的内容 hash。
 * 用于过滤 save 之后、draft push 之前到达的过期 dirty 通知。
 */
const lastPersistedContentHashByFileId = new Map<string, string>();

export function noteMindMapPersistedSnapshot(
  fileId: string,
  document: MindMapSaveDocument,
): void {
  lastPersistedContentHashByFileId.set(fileId, hashDocumentSnapshot(document));
}

export function clearMindMapPersistedSnapshot(fileId?: string): void {
  if (fileId) {
    lastPersistedContentHashByFileId.delete(fileId);
    return;
  }
  lastPersistedContentHashByFileId.clear();
}

export function matchesMindMapPersistedSnapshot(
  fileId: string,
  document: MindMapSaveDocument,
): boolean {
  const persistedHash = lastPersistedContentHashByFileId.get(fileId);
  if (!persistedHash) {
    return false;
  }
  return hashDocumentSnapshot(document) === persistedHash;
}
