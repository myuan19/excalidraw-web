import { ExcalidrawAdapter } from "./ExcalidrawAdapter";
import { MindMapAdapter } from "./MindMapAdapter";

import type { DocumentFormatAdapter } from "./types";

export { ExcalidrawAdapter, MindMapAdapter };

const adapters: Array<DocumentFormatAdapter<any>> = [
  ExcalidrawAdapter,
  MindMapAdapter,
];

const byKind = new Map(adapters.map((adapter) => [adapter.kind, adapter]));

export function getDocumentFormatAdapter(
  kind: string | null | undefined,
): DocumentFormatAdapter<any> | null {
  return kind ? byKind.get(kind) ?? null : null;
}

export function listDocumentFormatAdapters(): Array<
  DocumentFormatAdapter<any>
> {
  return adapters;
}
