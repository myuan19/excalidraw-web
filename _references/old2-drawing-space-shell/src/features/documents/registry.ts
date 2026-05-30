import { ExcalidrawDocumentAdapter } from "./adapters/ExcalidrawAdapter";
import { MindMapDocumentAdapter } from "./adapters/MindMapAdapter";
import { TextDocumentAdapter } from "./adapters/TextAdapter";
import { normalizeDocument } from "./documentTypes";
import type { DocumentFormatAdapter } from "./adapters/types";

const adapters = [
  ExcalidrawDocumentAdapter,
  MindMapDocumentAdapter,
  TextDocumentAdapter,
] satisfies DocumentFormatAdapter[];

function extensionOf(filename: string): string {
  const match = filename.toLowerCase().match(/\.[^.]+$/);
  return match?.[0] ?? "";
}

export function getDocumentAdapter(kind: string): DocumentFormatAdapter | null {
  return adapters.find((adapter) => adapter.kind === kind) ?? null;
}

export function getDocumentAdapterForFile(file: File): DocumentFormatAdapter | null {
  const extension = extensionOf(file.name);
  return (
    adapters.find((adapter) => adapter.extensions.includes(extension)) ??
    adapters.find((adapter) => adapter.mimeTypes.includes(file.type)) ??
    null
  );
}

export function detectDocumentKindFromData(data: unknown, filename = "", mimeType = ""): string {
  const document = normalizeDocument(data);
  if (document) return document.kind;
  const extension = extensionOf(filename);
  const adapter =
    adapters.find((item) => item.extensions.includes(extension)) ??
    adapters.find((item) => item.mimeTypes.includes(mimeType));
  return adapter?.kind ?? "excalidraw";
}

export function listDocumentAdapters(): DocumentFormatAdapter[] {
  return [...adapters];
}
