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

/** 正式文件保存时保留现有文件名，不再从根节点反推。 */
export function resolveMindMapSaveDisplayName(
  _data: MindMapDocumentData,
  currentName: string | null | undefined,
): string {
  const name = String(currentName ?? "").trim();
  return name || DEFAULT_DOCUMENT_DISPLAY_NAME;
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
