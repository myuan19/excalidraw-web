import {
  normalizeDocument,
  type ManagedDocument,
} from "../documentTypes";
import { migrateManagedDocument } from "../documentMigrations";
import { mindMapRichTextToPlainText } from "../thumbnailSvg";

import type { DocumentFormatAdapter } from "./types";

const MINDMAP_FORMAT_VERSION = 1;
const CONTAINER_VERSION = 1;
const SIMPLE_MIND_MAP_VERSION = "0.14.0-fix.2";

export type MindMapNodeData = {
  text: string;
  image?: string;
  note?: string;
  hyperlink?: string;
  richText?: boolean;
  expand?: boolean;
  [key: string]: unknown;
};

export type MindMapNode = {
  data: MindMapNodeData;
  children?: MindMapNode[];
};

export type MindMapDocumentData = {
  root: MindMapNode;
  layout?: string;
  theme?: {
    template?: string;
    config?: Record<string, unknown>;
  };
  config?: Record<string, unknown>;
  localConfig?: Record<string, unknown> | null;
  lang?: string;
  /** Accepted from native/simple-mind-map payloads, but stripped before persistence. */
  view?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isMindMapNode(value: unknown): value is MindMapNode {
  if (!isRecord(value) || !isRecord(value.data)) {
    return false;
  }
  if (typeof value.data.text !== "string") {
    return false;
  }
  return !("children" in value) || Array.isArray(value.children);
}

function nodeHasVisibleContent(node: MindMapNode): boolean {
  if (mindMapRichTextToPlainText(node.data.text)) {
    return true;
  }
  if (
    typeof node.data.image === "string" && node.data.image.trim() ||
    typeof node.data.note === "string" && node.data.note.trim() ||
    typeof node.data.hyperlink === "string" && node.data.hyperlink.trim()
  ) {
    return true;
  }
  return (node.children ?? []).some(nodeHasVisibleContent);
}

export function isEffectivelyEmptyMindMapData(
  data: unknown,
): boolean {
  return isRecord(data) && isMindMapNode(data.root) && !nodeHasVisibleContent(data.root);
}

/** True when the map has only the root node (no child nodes), like a fresh blank canvas. */
export function isMindMapSingleRootOnly(data: unknown): boolean {
  if (!isRecord(data)) {
    return false;
  }
  const root = isMindMapNode(data.root)
    ? data.root
    : isRecord(data.data) && isMindMapNode(data.data.root)
      ? (data.data as { root: MindMapNode }).root
      : null;
  if (!root) {
    return false;
  }
  return (root.children ?? []).length === 0;
}

/**
 * Extract the root node's plain-text label from a MindMap document,
 * suitable for use as the file display name.
 */
export function getMindMapRootText(data: MindMapDocumentData): string {
  return mindMapRichTextToPlainText(data.root?.data?.text ?? "").trim();
}

export function stripMindMapViewportState(
  data: MindMapDocumentData,
): MindMapDocumentData {
  const { view: _view, ...persistedData } = data;
  return persistedData;
}

function parseJsonString(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    throw new Error("Invalid MindMap JSON");
  }
}

export const MindMapAdapter: DocumentFormatAdapter<MindMapDocumentData> = {
  kind: "mindmap",
  currentFormatVersion: MINDMAP_FORMAT_VERSION,
  extensions: [".smm", ".json"],
  mimeTypes: ["application/json", "application/vnd.simple-mind-map+json"],

  createEmpty(): MindMapDocumentData {
    return {
      root: {
        data: {
          text: "<p>根节点</p>",
          richText: true,
          expand: true,
        },
        children: [],
      },
      layout: "logicalStructure",
      theme: {
        template: "classic4",
        config: {},
      },
    };
  },

  async parse(input: Blob | unknown): Promise<MindMapDocumentData> {
    if (typeof Blob !== "undefined" && input instanceof Blob) {
      return this.migrate(parseJsonString(await input.text()), 1);
    }
    return this.migrate(input, 1);
  },

  async serialize(data: MindMapDocumentData): Promise<object> {
    return this.toDocument(data);
  },

  migrate(data: unknown): MindMapDocumentData {
    const document = normalizeDocument(data);
    if (document?.kind === "mindmap" && this.validate(document.data)) {
      const migrated = migrateManagedDocument(document);
      if (migrated.kind === "mindmap" && this.validate(migrated.data)) {
        return stripMindMapViewportState(migrated.data);
      }
    }
    if (this.validate(data)) {
      return stripMindMapViewportState(data);
    }
    throw new Error("Invalid MindMap document");
  },

  validate(data: unknown): data is MindMapDocumentData {
    return isRecord(data) && isMindMapNode(data.root);
  },

  toDocument(data: MindMapDocumentData): ManagedDocument<MindMapDocumentData> {
    return {
      kind: "mindmap",
      containerVersion: CONTAINER_VERSION,
      formatVersion: MINDMAP_FORMAT_VERSION,
      sourceVersion: SIMPLE_MIND_MAP_VERSION,
      data: stripMindMapViewportState(data),
    };
  },
};
