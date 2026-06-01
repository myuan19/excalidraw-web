import type { MindMapDocumentData } from "./formats/MindMapAdapter";

export type MindMapBrowserViewState = {
  transform: Record<string, unknown>;
  state: Record<string, unknown>;
};

const STORAGE_PREFIX = "mindmap-browser-view-v1-";

function storageKey(fileId: string): string {
  return `${STORAGE_PREFIX}${fileId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isMindMapBrowserViewState(
  value: unknown,
): value is MindMapBrowserViewState {
  return (
    isRecord(value) &&
    isRecord(value.transform) &&
    isRecord(value.state)
  );
}

export function saveMindMapBrowserView(fileId: string, view: unknown): void {
  if (!isMindMapBrowserViewState(view)) {
    return;
  }
  try {
    localStorage.setItem(storageKey(fileId), JSON.stringify({ v: 1, view }));
  } catch {
    // quota / private mode
  }
}

export function saveMindMapBrowserViewFromData(
  fileId: string,
  data: unknown,
): void {
  if (!isRecord(data)) {
    return;
  }
  if (isMindMapBrowserViewState(data.view)) {
    saveMindMapBrowserView(fileId, data.view);
    return;
  }
  if (isRecord(data.data) && isMindMapBrowserViewState(data.data.view)) {
    saveMindMapBrowserView(fileId, data.data.view);
  }
}

export function clearMindMapBrowserView(fileId: string): void {
  try {
    localStorage.removeItem(storageKey(fileId));
  } catch {
    // ignore
  }
}

export function readMindMapBrowserView(
  fileId: string,
): MindMapBrowserViewState | null {
  try {
    const raw = localStorage.getItem(storageKey(fileId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { v?: unknown; view?: unknown };
    return parsed.v === 1 && isMindMapBrowserViewState(parsed.view)
      ? parsed.view
      : null;
  } catch {
    return null;
  }
}

export function applyMindMapBrowserView(
  data: MindMapDocumentData,
  fileId: string | null,
): MindMapDocumentData {
  if (!fileId) {
    return data;
  }
  const view = readMindMapBrowserView(fileId);
  return view ? { ...data, view } : data;
}
