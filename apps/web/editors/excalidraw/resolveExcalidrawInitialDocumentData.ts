import { ExcalidrawAdapter } from "../../data/formats/ExcalidrawAdapter";

export type ExcalidrawInitialDocumentSource = {
  elements?: unknown;
  appState?: unknown;
  files?: unknown;
} | null | undefined;

function parseExcalidrawDocument(raw: unknown, name?: string) {
  try {
    const parsed = ExcalidrawAdapter.parse(raw);
    return {
      elements: parsed.elements ?? [],
      appState: parsed.appState ?? {},
      files: parsed.files ?? {},
    };
  } catch {
    return ExcalidrawAdapter.createEmpty(name);
  }
}

/** Prefer in-memory edits when remounting a cached Excalidraw pane. */
export function resolveExcalidrawInitialDocumentData(
  fileData: unknown,
  fileName: string | undefined,
  latestDocument: ExcalidrawInitialDocumentSource,
) {
  if (latestDocument) {
    return parseExcalidrawDocument(latestDocument, fileName);
  }
  return parseExcalidrawDocument(fileData, fileName);
}
