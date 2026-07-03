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

const VIEW_SAVE_DEBOUNCE_MS = 300;

let pendingBrowserView: { fileId: string; view: unknown } | null = null;
let browserViewSaveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 平移/缩放会在拖拽期间逐帧触发 view_data_change，若每帧都同步写 localStorage，
 * 会阻塞与思维导图 iframe 共用的主线程造成拖拽卡顿（对应 Excalidraw 侧的
 * scheduleExcalidrawBrowserSceneSave 防抖）。这里做尾部防抖，只在停止交互后落一次盘，
 * 并通过 flushMindMapBrowserView 在切后台/卸载时把最后一次视图状态补写落盘。
 */
export function scheduleSaveMindMapBrowserView(
  fileId: string,
  view: unknown,
): void {
  if (!isMindMapBrowserViewState(view)) {
    return;
  }
  if (pendingBrowserView && pendingBrowserView.fileId !== fileId) {
    flushMindMapBrowserView();
  }
  pendingBrowserView = { fileId, view };
  if (browserViewSaveTimer !== null) {
    clearTimeout(browserViewSaveTimer);
  }
  browserViewSaveTimer = setTimeout(() => {
    browserViewSaveTimer = null;
    flushMindMapBrowserView();
  }, VIEW_SAVE_DEBOUNCE_MS);
}

export function flushMindMapBrowserView(): void {
  if (browserViewSaveTimer !== null) {
    clearTimeout(browserViewSaveTimer);
    browserViewSaveTimer = null;
  }
  if (!pendingBrowserView) {
    return;
  }
  const { fileId, view } = pendingBrowserView;
  pendingBrowserView = null;
  saveMindMapBrowserView(fileId, view);
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

export function moveMindMapBrowserViewBetweenFiles(
  fromFileId: string,
  toFileId: string,
): void {
  try {
    const raw = localStorage.getItem(storageKey(fromFileId));
    if (!raw) {
      return;
    }
    localStorage.setItem(storageKey(toFileId), raw);
    localStorage.removeItem(storageKey(fromFileId));
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
