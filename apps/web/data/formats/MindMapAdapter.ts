import type { ManagedDocument } from "../documentTypes";

import type { DocumentFormatAdapter } from "./types";

const DEFAULT_CONTAINER_VERSION = 1;
const DEFAULT_FORMAT_VERSION = 1;
const DEFAULT_ROOT_TEXT = "未命名思维导图";

export interface MindMapNodeData {
  text?: string;
  richText?: boolean;
  expand?: boolean;
  [key: string]: unknown;
}

export interface MindMapNode {
  data?: MindMapNodeData;
  children?: MindMapNode[];
  [key: string]: unknown;
}

export interface MindMapDocumentData {
  root: MindMapNode;
  theme?: string;
  layout?: string;
  config?: Record<string, unknown>;
  view?: unknown;
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeRootText(text: string): string {
  const trimmed = text.trim() || DEFAULT_ROOT_TEXT;
  return `<p>${trimmed.replace(/[<>&]/g, (ch) => {
    if (ch === "<") {
      return "&lt;";
    }
    if (ch === ">") {
      return "&gt;";
    }
    return "&amp;";
  })}</p>`;
}

export function createMindMapRootText(name?: string): string {
  return normalizeRootText(name || DEFAULT_ROOT_TEXT);
}

export function createEmptyMindMapData(name = DEFAULT_ROOT_TEXT): MindMapDocumentData {
  return {
    root: {
      data: {
        text: createMindMapRootText(name),
        richText: true,
        expand: true,
      },
      children: [],
    },
    theme: "default",
    layout: "logicalStructure",
  };
}

export function getMindMapRootText(data: MindMapDocumentData): string {
  const raw = data.root?.data?.text;
  return typeof raw === "string" ? raw : "";
}

export function isMindMapSingleRootOnly(value: unknown): boolean {
  const data =
    isRecord(value) && isRecord(value.data)
      ? (value.data as unknown)
      : value;
  if (!MindMapAdapter.validate(data)) {
    return false;
  }
  const children = data.root.children;
  return !Array.isArray(children) || children.length === 0;
}

export const MindMapAdapter: DocumentFormatAdapter<MindMapDocumentData> = {
  kind: "mindmap",
  extensions: [".smm"],
  mimeTypes: ["application/vnd.simple-mind-map+json", "application/json"],

  createEmpty: createEmptyMindMapData,

  validate(value: unknown): value is MindMapDocumentData {
    return isRecord(value) && isRecord(value.root);
  },

  toDocument(data: MindMapDocumentData): ManagedDocument<MindMapDocumentData> {
    return {
      kind: "mindmap",
      containerVersion: DEFAULT_CONTAINER_VERSION,
      formatVersion: DEFAULT_FORMAT_VERSION,
      data,
    };
  },

  serialize(data: MindMapDocumentData): unknown {
    return data;
  },

  parse(raw: unknown): MindMapDocumentData {
    if (this.validate(raw)) {
      return raw;
    }
    if (isRecord(raw) && this.validate(raw.data)) {
      return raw.data;
    }
    throw new Error("Invalid MindMap document");
  },
};
