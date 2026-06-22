import { devDebug } from "../../lib/devDebug";
import { createLogger } from "../../lib/logger";
import { mindMapRichTextToPlainText } from "../../data/thumbnailSvg";
import { forwardMindMapHostDebug } from "./mindMapHostDebugForward";

import type { MindMapDocumentData } from "../../data/formats/MindMapAdapter";

const logPersist = createLogger({ module: "mindmap-persist" });

export type MindMapTreeIntegritySummary = {
  nodeCount: number;
  emptyTextCount: number;
  rootChildren: number;
  collapsedWithChildrenCount: number;
  maxDepth: number;
};

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

export function summarizeMindMapRichTextTree(
  data: MindMapDocumentData,
): {
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

export function summarizeMindMapTreeIntegrity(
  data: MindMapDocumentData,
): MindMapTreeIntegritySummary {
  const totals: MindMapTreeIntegritySummary = {
    nodeCount: 0,
    emptyTextCount: 0,
    rootChildren: data.root?.children?.length ?? 0,
    collapsedWithChildrenCount: 0,
    maxDepth: 0,
  };
  const walk = (node: MindMapDocumentData["root"], depth: number): void => {
    if (!node?.data) {
      return;
    }
    totals.nodeCount += 1;
    totals.maxDepth = Math.max(totals.maxDepth, depth);
    if (!mindMapRichTextToPlainText(String(node.data.text || ""))) {
      totals.emptyTextCount += 1;
    }
    const children = node.children ?? [];
    if (node.data.expand === false && children.length > 0) {
      totals.collapsedWithChildrenCount += 1;
    }
    for (const child of children) {
      walk(child, depth + 1);
    }
  };
  if (data.root) {
    walk(data.root, 1);
  }
  return totals;
}

export function compareMindMapTreeIntegrityRegression(
  previous: MindMapTreeIntegritySummary,
  incoming: MindMapTreeIntegritySummary,
): { regressed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (incoming.nodeCount < previous.nodeCount) {
    reasons.push(`nodeCount ${previous.nodeCount} -> ${incoming.nodeCount}`);
  }
  if (incoming.emptyTextCount > previous.emptyTextCount) {
    reasons.push(
      `emptyTextCount ${previous.emptyTextCount} -> ${incoming.emptyTextCount}`,
    );
  }
  if (incoming.rootChildren < previous.rootChildren) {
    reasons.push(
      `rootChildren ${previous.rootChildren} -> ${incoming.rootChildren}`,
    );
  }
  return { regressed: reasons.length > 0, reasons };
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

export function debugMindMapPersist(
  label: string,
  data?: Record<string, unknown>,
): void {
  devDebug("mindmap-persist", label, data);
  forwardMindMapHostDebug("mindmap-persist", label, data);
}

/** Always logged — save snapshot integrity regressions (console + server ingest). */
export function warnMindMapPersist(
  label: string,
  data: Record<string, unknown> = {},
): void {
  logPersist.event("warn", "mindmap-persist.warn", label, {
    fields: data,
  });
  console.warn(`[mindmap-persist] ${label}`, data);
}
