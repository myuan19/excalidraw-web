import { ExcalidrawAdapter } from "./ExcalidrawAdapter";
import { MindMapAdapter } from "./MindMapAdapter";
import { TextAdapter } from "./TextAdapter";

import type { DocumentKind } from "../documentTypes";
import type { DocumentFormatAdapter } from "./types";

const adapters = new Map<DocumentKind, DocumentFormatAdapter>([
  [ExcalidrawAdapter.kind, ExcalidrawAdapter],
  [MindMapAdapter.kind, MindMapAdapter],
  [TextAdapter.kind, TextAdapter],
]);

export function getDocumentFormatAdapter(
  kind: DocumentKind,
): DocumentFormatAdapter | null {
  return adapters.get(kind) ?? null;
}

export function listDocumentFormatAdapters(): DocumentFormatAdapter[] {
  return Array.from(adapters.values());
}

export { ExcalidrawAdapter, MindMapAdapter, TextAdapter };
export type { DocumentFormatAdapter };
