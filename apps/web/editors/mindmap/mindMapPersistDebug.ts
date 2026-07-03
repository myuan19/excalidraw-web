import { devDebug, isDevDebugChannelEnabled } from "../../lib/devDebug";
import { forwardMindMapHostDebug } from "./mindMapHostDebugForward";

import type { MindMapDocumentData } from "../../data/formats/MindMapAdapter";

export function summarizeMindMapRichTextNode(text: string | undefined): {
  textLen: number;
  strongCount: number;
  indentSpanCount: number;
  hasRichParagraphs: boolean;
} {
  const html = String(text || "");
  return {
    textLen: html.length,
    strongCount: (html.match(/<strong\b/gi) || []).length,
    indentSpanCount: (html.match(/ql-indent-/gi) || []).length,
    hasRichParagraphs: /<p\b/i.test(html),
  };
}

export function summarizeMindMapRichTextTree(data: MindMapDocumentData): {
  nodeCount: number;
  richTextNodeCount: number;
  totalStrongCount: number;
  totalIndentSpanCount: number;
} {
  const totals = {
    nodeCount: 0,
    richTextNodeCount: 0,
    totalStrongCount: 0,
    totalIndentSpanCount: 0,
  };
  const walk = (node: MindMapDocumentData["root"]): void => {
    if (!node?.data) {
      return;
    }
    totals.nodeCount += 1;
    if (node.data.richText === true) {
      totals.richTextNodeCount += 1;
    }
    const summary = summarizeMindMapRichTextNode(String(node.data.text || ""));
    totals.totalStrongCount += summary.strongCount;
    totals.totalIndentSpanCount += summary.indentSpanCount;
    for (const child of node.children || []) {
      walk(child);
    }
  };
  if (data.root) {
    walk(data.root);
  }
  return totals;
}

/** 日志采样：优先返回富文本最丰富的节点（而非仅根节点）。 */
export function findFirstRichMindMapNodeSummary(
  data: MindMapDocumentData,
  needle?: string,
): Record<string, unknown> | null {
  let found: Record<string, unknown> | null = null;
  let bestStrong = -1;
  const walk = (node: MindMapDocumentData["root"]): void => {
    if (!node?.data) {
      return;
    }
    const text = String(node.data.text || "");
    if (!needle || text.includes(needle)) {
      const summary = summarizeMindMapRichTextNode(text);
      if (summary.strongCount >= bestStrong) {
        bestStrong = summary.strongCount;
        found = {
          richText: node.data.richText === true,
          ...summary,
          textPreview: text.slice(0, 120),
        };
      }
    }
    for (const child of node.children || []) {
      walk(child);
    }
  };
  walk(data.root);
  return found;
}

export function isMindMapPersistDebugEnabled(): boolean {
  return isDevDebugChannelEnabled("mindmap-persist");
}

export function debugMindMapPersist(
  label: string,
  data?: Record<string, unknown> | (() => Record<string, unknown>),
): void {
  if (!isMindMapPersistDebugEnabled()) {
    return;
  }
  // 惰性数据：哈希/全树采样等重实参放进函数，关闭调试时不求值。
  const resolved = typeof data === "function" ? data() : data;
  devDebug("mindmap-persist", label, resolved);
  forwardMindMapHostDebug("mindmap-persist", label, resolved);
}
