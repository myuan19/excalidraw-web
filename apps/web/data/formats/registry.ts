import { ExcalidrawAdapter } from "./ExcalidrawAdapter";
import { MindMapAdapter } from "./MindMapAdapter";

import type { DocumentFormatAdapter } from "./types";

const adapters: DocumentFormatAdapter[] = [
  ExcalidrawAdapter,
  MindMapAdapter,
];

const byKind = new Map(adapters.map((adapter) => [adapter.kind, adapter]));

export function getDocumentFormatAdapter(
  kind: string | null | undefined,
): DocumentFormatAdapter | null {
  return kind ? byKind.get(kind) ?? null : null;
}

export function listDocumentFormatAdapters(): DocumentFormatAdapter[] {
  return adapters;
}
