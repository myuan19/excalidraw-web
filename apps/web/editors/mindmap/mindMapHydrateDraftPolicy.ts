import { hashDocumentSnapshot } from "../../data/sceneHash";
import { summarizeMindMapRichTextTree } from "./mindMapPersistDebug";

import type { MindMapDocumentData } from "../../data/formats/MindMapAdapter";
import type { MindMapSaveDocument } from "./mindMapDraftState";

export type MindMapRichTextTreeSummary = {
  nodeCount: number;
  richTextNodeCount: number;
  totalStrongCount: number;
  totalIndentSpanCount: number;
};

export type MindMapHydrateAnchor = {
  contentHash: string;
  richText: MindMapRichTextTreeSummary;
};

export type MindMapHydrateDraftDecision = {
  adoptBaseline: boolean;
  updateHostDocument: boolean;
  reason:
    | "save-response"
    | "user-edit"
    | "no-anchor"
    | "anchor-hash-match"
    | "rich-text-preserving"
    | "regressed-rich-text"
    | "regressed-content-hash";
};

/** 打开文件时记录的权威载荷，用于 hydrate 期间过滤 iframe 初始化草稿。 */
export function createMindMapHydrateAnchor(
  document: MindMapSaveDocument,
): MindMapHydrateAnchor {
  return {
    contentHash: hashDocumentSnapshot(document),
    richText: summarizeMindMapRichTextTree(document.data),
  };
}

function isRichTextWeaker(
  anchor: MindMapRichTextTreeSummary,
  incoming: MindMapRichTextTreeSummary,
): boolean {
  return (
    incoming.totalStrongCount < anchor.totalStrongCount ||
    incoming.richTextNodeCount < anchor.richTextNodeCount ||
    incoming.totalIndentSpanCount < anchor.totalIndentSpanCount
  );
}

/**
 * hydrate 期间 iframe 程序化 data_change（主题同步等）是否允许覆盖宿主基线。
 * 纯策略：不触碰 FileSyncState / React。
 */
export function explainHydrateDraftDecision(opts: {
  anchor: MindMapHydrateAnchor | null;
  incoming: MindMapSaveDocument;
  isSaveResponse: boolean;
  userEdit?: boolean;
}): MindMapHydrateDraftDecision {
  if (opts.isSaveResponse) {
    return {
      adoptBaseline: true,
      updateHostDocument: true,
      reason: "save-response",
    };
  }

  if (opts.userEdit === true) {
    return {
      adoptBaseline: false,
      updateHostDocument: true,
      reason: "user-edit",
    };
  }

  const anchor = opts.anchor;
  if (!anchor) {
    return {
      adoptBaseline: true,
      updateHostDocument: true,
      reason: "no-anchor",
    };
  }

  const incomingHash = hashDocumentSnapshot(opts.incoming);
  const incomingRich = summarizeMindMapRichTextTree(opts.incoming.data);

  if (incomingHash === anchor.contentHash) {
    return {
      adoptBaseline: true,
      updateHostDocument: true,
      reason: "anchor-hash-match",
    };
  }

  if (isRichTextWeaker(anchor.richText, incomingRich)) {
    return {
      adoptBaseline: false,
      updateHostDocument: false,
      reason: "regressed-rich-text",
    };
  }

  return {
    adoptBaseline: true,
    updateHostDocument: true,
    reason: "rich-text-preserving",
  };
}

export type MindMapOpenHydrateSession = {
  anchor: MindMapHydrateAnchor;
  document: MindMapSaveDocument;
};

export function beginMindMapOpenHydrateSession(
  document: MindMapSaveDocument,
): MindMapOpenHydrateSession {
  return {
    anchor: createMindMapHydrateAnchor(document),
    document,
  };
}

/** hydrate settle 结束时选用哪份文档对齐基线。 */
export function resolveMindMapHydrateBaselineDocument(opts: {
  session: MindMapOpenHydrateSession | null;
  latest: MindMapSaveDocument;
}): MindMapSaveDocument {
  if (!opts.session) {
    return opts.latest;
  }
  const decision = explainHydrateDraftDecision({
    anchor: opts.session.anchor,
    incoming: opts.latest,
    isSaveResponse: false,
  });
  return decision.adoptBaseline ? opts.latest : opts.session.document;
}

export function shouldAdoptHydrateDraft(
  opts: Parameters<typeof explainHydrateDraftDecision>[0],
): boolean {
  return explainHydrateDraftDecision(opts).adoptBaseline;
}

export function shouldUpdateHostDocumentOnHydrateDraft(
  opts: Parameters<typeof explainHydrateDraftDecision>[0],
): boolean {
  return explainHydrateDraftDecision(opts).updateHostDocument;
}

/** 测试与诊断：构造带富文本子节点的最小树。 */
export function mindMapDataWithStrongChild(
  strongHtml: string,
): MindMapDocumentData {
  return {
    root: {
      data: { text: "<p><span>root</span></p>", richText: true },
      children: [
        {
          data: { text: strongHtml, richText: true },
          children: [],
        },
      ],
    },
    theme: { template: "classic4", config: {} },
    layout: "logicalStructure",
    config: {},
    view: null,
    lang: "zh",
    localConfig: null,
  };
}
