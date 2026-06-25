import { DEFAULT_DOCUMENT_DISPLAY_NAME } from "../defaultDocumentName";
import { isManagedDocument, type ManagedDocument } from "../documentTypes";
import { mindMapRichTextToPlainText } from "../thumbnailSvg";

import {
  compactMindMapPersistedConfig,
  repairLegacyMindMapConfig,
} from "./mindMapPersistedConfig";

import type { DocumentFormatAdapter } from "./types";

const DEFAULT_CONTAINER_VERSION = 1;
const DEFAULT_FORMAT_VERSION = 1;
const DEFAULT_ROOT_TEXT = DEFAULT_DOCUMENT_DISPLAY_NAME;
export const SIMPLE_MIND_MAP_VERSION = "0.14.0-fix.2";

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
  theme?: string | { template?: string; config?: Record<string, unknown> };
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

export function createEmptyMindMapData(
  name = DEFAULT_ROOT_TEXT,
): MindMapDocumentData {
  return {
    root: {
      data: {
        text: createMindMapRootText(name),
        richText: true,
        expand: true,
      },
      children: [],
    },
    theme: {
      template: "classic4",
      config: {},
    },
    layout: "logicalStructure",
  };
}

/** Root label as stored on canvas (may be empty when the user clears the node). */
export function getMindMapRootPlainText(data: MindMapDocumentData): string {
  const raw = data.root?.data?.text;
  return mindMapRichTextToPlainText(typeof raw === "string" ? raw : "").trim();
}

/**
 * Root label for display / file-name sync. Empty canvas text falls back to 未命名.
 */
export function getMindMapRootText(data: MindMapDocumentData): string {
  return getMindMapRootPlainText(data) || DEFAULT_DOCUMENT_DISPLAY_NAME;
}

export function stripMindMapViewportState(
  data: MindMapDocumentData,
): MindMapDocumentData {
  const { view: _view, ...persisted } = data;
  return persisted;
}

function nodeHasVisibleContent(node: MindMapNode): boolean {
  const rawText = node.data?.text;
  const text = mindMapRichTextToPlainText(
    typeof rawText === "string" ? rawText : "",
  );
  if (text) {
    return true;
  }
  const children = node.children;
  return (
    Array.isArray(children) &&
    children.some((child) => nodeHasVisibleContent(child))
  );
}

export function isEffectivelyEmptyMindMapData(data: unknown): boolean {
  if (!isRecord(data) || !isRecord(data.root)) {
    return false;
  }
  return !nodeHasVisibleContent(data.root as MindMapNode);
}

function normalizeMindMapDocumentData(
  data: MindMapDocumentData,
): MindMapDocumentData {
  const stripped = stripMindMapViewportState(data);
  const config = repairLegacyMindMapConfig(stripped.config);
  if (config === stripped.config) {
    return stripped;
  }
  const next = { ...stripped };
  if (config === undefined) {
    delete next.config;
  } else {
    next.config = config;
  }
  return next;
}

export function isMindMapSingleRootOnly(value: unknown): boolean {
  const data =
    isRecord(value) && isRecord(value.data) ? (value.data as unknown) : value;
  if (!MindMapAdapter.validate(data)) {
    return false;
  }
  const children = data.root.children;
  return !Array.isArray(children) || children.length === 0;
}

function migrateMindMapDocumentData(input: unknown): MindMapDocumentData {
  if (isManagedDocument(input) && input.kind === "mindmap") {
    return normalizeMindMapDocumentData(input.data as MindMapDocumentData);
  }
  if (MindMapAdapter.validate(input)) {
    return normalizeMindMapDocumentData(input);
  }
  if (isRecord(input) && MindMapAdapter.validate(input.data)) {
    return normalizeMindMapDocumentData(input.data as MindMapDocumentData);
  }
  throw new Error("Invalid MindMap document");
}

export const MindMapAdapter: DocumentFormatAdapter<MindMapDocumentData> = {
  kind: "mindmap",
  extensions: [".smm"],
  mimeTypes: ["application/vnd.simple-mind-map+json", "application/json"],

  createEmpty: createEmptyMindMapData,

  validate(value: unknown): value is MindMapDocumentData {
    return isRecord(value) && isRecord(value.root);
  },

  migrate(
    input: unknown,
    _targetFormatVersion = DEFAULT_FORMAT_VERSION,
  ): MindMapDocumentData {
    return migrateMindMapDocumentData(input);
  },

  toDocument(data: MindMapDocumentData): ManagedDocument<MindMapDocumentData> {
    const stripped = stripMindMapViewportState(data);
    const config = compactMindMapPersistedConfig(stripped.config);
    const normalized: MindMapDocumentData = { ...stripped };
    if (config === undefined) {
      delete normalized.config;
    } else {
      normalized.config = config;
    }
    return {
      kind: "mindmap",
      containerVersion: DEFAULT_CONTAINER_VERSION,
      formatVersion: DEFAULT_FORMAT_VERSION,
      sourceVersion: SIMPLE_MIND_MAP_VERSION,
      data: normalized,
    };
  },

  serialize(data: MindMapDocumentData): unknown {
    return data;
  },

  parse(raw: unknown): MindMapDocumentData {
    return migrateMindMapDocumentData(raw);
  },
};
