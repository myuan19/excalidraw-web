import { migrateManagedDocument } from "../documentMigrations";
import { isRecord, normalizeDocument, type ManagedDocument } from "../documentTypes";
import type { DocumentFormatAdapter } from "./types";

export type MindMapNodeData = {
  text: string;
  richText?: boolean;
  expand?: boolean;
  image?: string;
  note?: string;
  hyperlink?: string;
  [key: string]: unknown;
};

export type MindMapNode = {
  data: MindMapNodeData;
  children?: MindMapNode[];
};

export type MindMapDocumentData = {
  root: MindMapNode;
  layout?: string;
  theme?: { template?: string; config?: Record<string, unknown> };
  config?: Record<string, unknown>;
  localConfig?: Record<string, unknown> | null;
  lang?: string;
  view?: unknown;
};

function isMindMapNode(value: unknown): value is MindMapNode {
  return (
    isRecord(value) &&
    isRecord(value.data) &&
    typeof value.data.text === "string" &&
    (!("children" in value) || Array.isArray(value.children))
  );
}

export function stripMindMapViewportState(data: MindMapDocumentData): MindMapDocumentData {
  const { view: _view, ...persisted } = data;
  return persisted;
}

export const MindMapDocumentAdapter: DocumentFormatAdapter<MindMapDocumentData> = {
  kind: "mindmap",
  currentFormatVersion: 1,
  extensions: [".smm", ".json"],
  mimeTypes: ["application/json", "application/vnd.simple-mind-map+json"],

  createEmpty() {
    return {
      root: { data: { text: "<p>根节点</p>", richText: true, expand: true }, children: [] },
      layout: "logicalStructure",
      theme: { template: "classic4", config: {} },
    };
  },

  async parse(input) {
    if (typeof Blob !== "undefined" && input instanceof Blob) {
      return this.migrate(JSON.parse(await input.text()));
    }
    return this.migrate(input);
  },

  async serialize(data) {
    return this.toDocument(data);
  },

  migrate(data) {
    const document = normalizeDocument(data);
    if (document?.kind === "mindmap") {
      const migrated = migrateManagedDocument(document);
      if (this.validate(migrated.data)) return stripMindMapViewportState(migrated.data);
    }
    if (this.validate(data)) return stripMindMapViewportState(data);
    throw new Error("Invalid MindMap document");
  },

  validate(data): data is MindMapDocumentData {
    return isRecord(data) && isMindMapNode(data.root);
  },

  toDocument(data): ManagedDocument<MindMapDocumentData> {
    return {
      kind: "mindmap",
      containerVersion: 1,
      formatVersion: 1,
      sourceVersion: "0.14.0-fix.2",
      data: stripMindMapViewportState(data),
    };
  },
};
