import type { MindMapDocumentData } from "./bridge";
import { sanitizeMindMapView } from "./mindMapView";

const STORAGE_PREFIX = "drawing-space-mindmap-view:";

export type MindMapBrowserView = Record<string, unknown>;

function key(fileId: string) {
  return `${STORAGE_PREFIX}${fileId}`;
}

export function saveMindMapBrowserView(fileId: string, view: MindMapBrowserView | null | undefined) {
  const sanitized = sanitizeMindMapView(view);
  if (!sanitized) return;
  try {
    localStorage.setItem(key(fileId), JSON.stringify({ v: 1, view: sanitized, updatedAt: new Date().toISOString() }));
  } catch {
    // Browser view persistence is best-effort.
  }
}

export function readMindMapBrowserView(fileId: string): MindMapBrowserView | null {
  try {
    const raw = localStorage.getItem(key(fileId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: unknown; view?: unknown };
    return parsed.v === 1 ? sanitizeMindMapView(parsed.view) : null;
  } catch {
    return null;
  }
}

export function applyMindMapBrowserView(
  fileId: string | null,
  data: MindMapDocumentData,
): MindMapDocumentData {
  if (!fileId) return data;
  const view = readMindMapBrowserView(fileId);
  return view ? { ...data, view: view as MindMapDocumentData["view"] } : data;
}
