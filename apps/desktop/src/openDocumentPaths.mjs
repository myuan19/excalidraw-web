import path from "node:path";

const OPENABLE_EXT =
  /\.(excalidraw|excalidrawlib|smm|mindmap\.json|excalidraw\.json)$/i;

export function isOpenableDocumentPath(filePath) {
  const normalized = String(filePath ?? "").trim();
  if (!normalized) {
    return false;
  }
  return OPENABLE_EXT.test(normalized);
}

/** Collect document paths from process.argv (Windows file association / double-click). */
export function parseOpenDocumentArgv(argv = process.argv) {
  const seen = new Set();
  const results = [];
  for (const arg of argv) {
    const trimmed = String(arg ?? "").trim();
    if (!trimmed || trimmed.startsWith("-")) {
      continue;
    }
    if (!isOpenableDocumentPath(trimmed)) {
      continue;
    }
    const resolved = path.resolve(trimmed);
    if (seen.has(resolved)) {
      continue;
    }
    seen.add(resolved);
    results.push(resolved);
  }
  return results;
}
