import { DEFAULT_DOCUMENT_DISPLAY_NAME } from "../../data/defaultDocumentName";
import { getMindMapRootText } from "../../data/formats/MindMapAdapter";

import type { MindMapDocumentData } from "../../data/formats/MindMapAdapter";

export type MindMapRootNameReconcileAction =
  | { kind: "noop" }
  | { kind: "promote-root-to-file"; name: string }
  | { kind: "push-file-to-root"; text: string };

function isDefaultDisplayName(name: string): boolean {
  return name === DEFAULT_DOCUMENT_DISPLAY_NAME;
}

/**
 * 打开文件时解析显示名：根节点已有非默认标题时，优先于过期的「未命名」列表缓存。
 */
export function resolveMindMapOpenDisplayName(
  data: MindMapDocumentData,
  cachedName: string | null | undefined,
): string {
  const rootText = getMindMapRootText(data);
  const listName = String(cachedName ?? "").trim();
  if (
    rootText &&
    !isDefaultDisplayName(rootText) &&
    (!listName || isDefaultDisplayName(listName))
  ) {
    return rootText;
  }
  if (listName) {
    return listName;
  }
  return rootText || DEFAULT_DOCUMENT_DISPLAY_NAME;
}

/**
 * hydrate settle 结束时对齐根节点标题与文件显示名。
 * 默认显示名过期时以根节点为准；根节点被清空时只重置文件显示名，不回写节点内容。
 */
export function reconcileMindMapRootAndFileName(
  displayName: string,
  rootPlainText: string,
): MindMapRootNameReconcileAction {
  const name = String(displayName || "").trim() || DEFAULT_DOCUMENT_DISPLAY_NAME;
  const root = String(rootPlainText || "").trim();
  if (!root) {
    if (isDefaultDisplayName(name)) {
      return { kind: "noop" };
    }
    return { kind: "promote-root-to-file", name: DEFAULT_DOCUMENT_DISPLAY_NAME };
  }
  if (root === name) {
    return { kind: "noop" };
  }
  if (
    isDefaultDisplayName(name) &&
    root &&
    !isDefaultDisplayName(root)
  ) {
    return { kind: "promote-root-to-file", name: root };
  }
  if (!name) {
    return { kind: "noop" };
  }
  return { kind: "push-file-to-root", text: name };
}
