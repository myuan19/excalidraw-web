/** 与 desktop sidecar `DOCUMENT_EXTENSIONS` 保持一致。 */
export const KNOWLEDGE_DOCUMENT_EXTENSIONS = [
  ".excalidraw",
  ".excalidraw.json",
  ".smm",
  ".mindmap.json",
] as const;

export function isKnowledgeDocumentFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return KNOWLEDGE_DOCUMENT_EXTENSIONS.some((extension) =>
    lower.endsWith(extension),
  );
}

export function filterKnowledgeDocumentPaths(paths: string[]): string[] {
  return paths.filter((absPath) =>
    isKnowledgeDocumentFileName(absPath.split(/[/\\]/).pop() ?? ""),
  );
}
