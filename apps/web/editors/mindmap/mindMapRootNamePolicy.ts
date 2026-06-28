import { DEFAULT_DOCUMENT_DISPLAY_NAME } from "../../data/defaultDocumentName";
import {
  getMindMapRootPlainText,
  getMindMapRootText,
} from "../../data/formats/MindMapAdapter";

import type { MindMapDocumentData } from "../../data/formats/MindMapAdapter";

export type MindMapRootNameReconcileAction =
  | { kind: "noop" }
  | { kind: "promote-root-to-file"; name: string }
  | { kind: "push-file-to-root"; text: string };

function isDefaultDisplayName(name: string): boolean {
  return name === DEFAULT_DOCUMENT_DISPLAY_NAME;
}

/** 打开文件时解析显示名：正式文件名与根节点标题相互独立。 */
export function resolveMindMapOpenDisplayName(
  data: MindMapDocumentData,
  cachedName: string | null | undefined,
): string {
  const rootText = getMindMapRootText(data);
  const listName = String(cachedName ?? "").trim();
  if (listName) {
    return listName;
  }
  return rootText || DEFAULT_DOCUMENT_DISPLAY_NAME;
}

/**
 * 正式文件内容保存时不发送 `name`，避免 UI 显示名与磁盘去重名不一致时触发 rename 冲突。
 * 文件重命名走独立的 rename API，不在 PUT 内容保存里附带 name。
 */
export function resolveMindMapSaveDisplayName(
  _data: MindMapDocumentData,
  _currentName: string | null | undefined,
): undefined {
  return undefined;
}

/** local draft 首次保存时，可用首次编辑后的根节点标题作为初始文件名。 */
export function resolveMindMapInitialSaveDisplayName(
  data: MindMapDocumentData,
  currentName: string | null | undefined,
): string {
  const name = String(currentName ?? "").trim();
  if (name && !isDefaultDisplayName(name)) {
    return name;
  }
  const rootPlainText = getMindMapRootPlainText(data);
  if (rootPlainText && !isDefaultDisplayName(rootPlainText)) {
    return rootPlainText;
  }
  return name || DEFAULT_DOCUMENT_DISPLAY_NAME;
}

/**
 * 文件名和 MindMap 根节点只在创建初始值时有关联；保存后互相独立。
 */
export function reconcileMindMapRootAndFileName(
  _displayName: string,
  _rootPlainText: string,
): MindMapRootNameReconcileAction {
  return { kind: "noop" };
}
