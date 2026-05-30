import { editorRegistry } from "../../editors/registry";
import { TextAdapter } from "./TextAdapter";

import type { DocumentKind } from "../documentTypes";
import type { DocumentFormatAdapter } from "./types";

const formatOnlyAdapters: DocumentFormatAdapter[] = [TextAdapter];

export function getDocumentFormatAdapter(
  kind: DocumentKind,
): DocumentFormatAdapter | null {
  return (
    editorRegistry.getByKind(kind)?.adapter ??
    formatOnlyAdapters.find((adapter) => adapter.kind === kind) ??
    null
  );
}

export function listDocumentFormatAdapters(): DocumentFormatAdapter[] {
  return [
    ...editorRegistry.list().map((plugin) => plugin.adapter),
    ...formatOnlyAdapters,
  ];
}

export { ExcalidrawAdapter } from "./ExcalidrawAdapter";
export { MindMapAdapter } from "./MindMapAdapter";
export { TextAdapter };
export type { DocumentFormatAdapter };
