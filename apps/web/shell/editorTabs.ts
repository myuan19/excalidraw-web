import { editorRegistry } from "../editors";

export type HomeEditorTab = {
  id: "home";
  type: "home";
  title: "首页";
  lastActiveAt: string;
};

export type FileEditorTab = {
  id: `file:${string}`;
  type: "file";
  fileId: string;
  kind: string;
  title: string;
  lastActiveAt: string;
  /** Stable pane-stack order; independent of title-bar tab strip order. */
  stackOrder: number;
};

export type EditorTabRecord = HomeEditorTab | FileEditorTab;

export type EditorTabsState = {
  activeTabId: string;
  tabs: EditorTabRecord[];
};

export const EDITOR_TABS_STORAGE_KEY = "editorhub-editor-tabs-v1";
export const EDITOR_TABS_CHANGE_EVENT = "editorhub-editor-tabs-change";
export const HOME_TAB_ID = "home";
const UNTITLED_TAB_TITLE = "未命名";

function nowIso(): string {
  return new Date().toISOString();
}

export function fileTabId(fileId: string): `file:${string}` {
  return `file:${fileId}`;
}

export function createHomeTab(lastActiveAt = nowIso()): HomeEditorTab {
  return {
    id: HOME_TAB_ID,
    type: "home",
    title: "首页",
    lastActiveAt,
  };
}

export function createInitialEditorTabsState(): EditorTabsState {
  return {
    activeTabId: HOME_TAB_ID,
    tabs: [createHomeTab()],
  };
}

function maxFileTabStackOrder(tabs: EditorTabRecord[]): number {
  let max = 0;
  for (const tab of tabs) {
    if (tab.type === "file" && typeof tab.stackOrder === "number") {
      max = Math.max(max, tab.stackOrder);
    }
  }
  return max;
}

function normalizeFileTab(
  tab: EditorTabRecord,
  fallbackStackOrder: number,
): FileEditorTab | null {
  if (tab.type !== "file" || !tab.fileId) {
    return null;
  }
  const stackOrder =
    typeof tab.stackOrder === "number" ? tab.stackOrder : fallbackStackOrder;
  return {
    id: fileTabId(tab.fileId),
    type: "file",
    fileId: tab.fileId,
    kind: editorRegistry.resolveKind(tab.kind),
    title: tab.title || UNTITLED_TAB_TITLE,
    lastActiveAt: tab.lastActiveAt || nowIso(),
    stackOrder,
  };
}

export function normalizeEditorTabsState(
  state: EditorTabsState | null | undefined,
): EditorTabsState {
  const seen = new Set<string>([HOME_TAB_ID]);
  const tabs: EditorTabRecord[] = [createHomeTab()];
  let nextStackFallback = 1;

  for (const tab of state?.tabs ?? []) {
    const fileTab = normalizeFileTab(tab, nextStackFallback);
    if (!fileTab || seen.has(fileTab.id)) {
      continue;
    }
    seen.add(fileTab.id);
    tabs.push(fileTab);
    nextStackFallback = Math.max(nextStackFallback, fileTab.stackOrder + 1);
  }

  const activeTabId =
    state?.activeTabId && tabs.some((tab) => tab.id === state.activeTabId)
      ? state.activeTabId
      : HOME_TAB_ID;

  return { activeTabId, tabs };
}

export function openFileTab(
  state: EditorTabsState,
  file: { fileId: string; kind: string; title: string },
): EditorTabsState {
  const normalized = normalizeEditorTabsState(state);
  const id = fileTabId(file.fileId);
  const activeAt = nowIso();
  const existing = normalized.tabs.find((tab) => tab.id === id);
  const nextStackOrder = maxFileTabStackOrder(normalized.tabs) + 1;

  if (existing?.type === "file") {
    const nextTitle =
      file.title && file.title !== UNTITLED_TAB_TITLE
        ? file.title
        : existing.title;
    return {
      activeTabId: id,
      tabs: normalized.tabs.map((tab) =>
        tab.id === id
          ? {
              ...existing,
              kind: file.kind,
              title: nextTitle,
              lastActiveAt: activeAt,
            }
          : tab,
      ),
    };
  }

  return {
    activeTabId: id,
    tabs: [
      ...normalized.tabs,
      {
        id,
        type: "file",
        fileId: file.fileId,
        kind: file.kind,
        title: file.title || UNTITLED_TAB_TITLE,
        lastActiveAt: activeAt,
        stackOrder: nextStackOrder,
      },
    ],
  };
}

export function activateTab(
  state: EditorTabsState,
  tabId: string,
): EditorTabsState {
  const normalized = normalizeEditorTabsState(state);
  if (!normalized.tabs.some((tab) => tab.id === tabId)) {
    return normalized;
  }
  const activeAt = nowIso();
  return {
    activeTabId: tabId,
    tabs: normalized.tabs.map((tab) =>
      tab.id === tabId ? { ...tab, lastActiveAt: activeAt } : tab,
    ),
  };
}

export function closeEditorTab(
  state: EditorTabsState,
  tabId: string,
): EditorTabsState {
  const normalized = normalizeEditorTabsState(state);
  if (tabId === HOME_TAB_ID) {
    return normalized;
  }

  const closingIndex = normalized.tabs.findIndex((tab) => tab.id === tabId);
  if (closingIndex < 0) {
    return normalized;
  }

  const tabs = normalized.tabs.filter((tab) => tab.id !== tabId);
  if (normalized.activeTabId !== tabId) {
    return { ...normalized, tabs };
  }

  const right = tabs[closingIndex];
  const left = tabs[closingIndex - 1];
  return {
    activeTabId: right?.id ?? left?.id ?? HOME_TAB_ID,
    tabs,
  };
}

export function replaceFileTab(
  state: EditorTabsState,
  opts: {
    fromFileId: string;
    toFileId: string;
    kind: string;
    title: string;
  },
): EditorTabsState {
  const normalized = normalizeEditorTabsState(state);
  const fromId = fileTabId(opts.fromFileId);
  const toId = fileTabId(opts.toFileId);
  const withoutExistingTarget = normalized.tabs.filter((tab) => tab.id !== toId);
  const replaced = withoutExistingTarget.map((tab) =>
    tab.id === fromId
      ? {
          id: toId,
          type: "file" as const,
          fileId: opts.toFileId,
          kind: opts.kind,
          title: opts.title || UNTITLED_TAB_TITLE,
          lastActiveAt: nowIso(),
          stackOrder:
            tab.type === "file" ? tab.stackOrder : maxFileTabStackOrder(normalized.tabs) + 1,
        }
      : tab,
  );

  return normalizeEditorTabsState({
    activeTabId: normalized.activeTabId === fromId ? toId : normalized.activeTabId,
    tabs: replaced,
  });
}

export function updateFileTabTitle(
  state: EditorTabsState,
  opts: { fileId: string; title: string },
): EditorTabsState {
  const normalized = normalizeEditorTabsState(state);
  const title = opts.title.trim();
  if (!title) {
    return normalized;
  }
  const id = fileTabId(opts.fileId);
  return {
    ...normalized,
    tabs: normalized.tabs.map((tab) =>
      tab.id === id && tab.type === "file" ? { ...tab, title } : tab,
    ),
  };
}

/**
 * File tabs for the cached editor pane stack. Order is stable (by tab id) and
 * intentionally independent of title-bar tab strip order — reordering tabs in
 * the strip must not reorder iframe-backed panes in the DOM.
 */
export function listFileEditorTabsForPaneStack(
  state: EditorTabsState,
): FileEditorTab[] {
  return normalizeEditorTabsState(state).tabs
    .filter((tab): tab is FileEditorTab => tab.type === "file")
    .sort((a, b) => a.stackOrder - b.stackOrder || a.id.localeCompare(b.id));
}

export function reorderFileTab(
  state: EditorTabsState,
  opts: {
    sourceTabId: string;
    targetTabId: string;
    position: "before" | "after";
  },
): EditorTabsState {
  const normalized = normalizeEditorTabsState(state);
  const sourceIndex = normalized.tabs.findIndex(
    (tab) => tab.id === opts.sourceTabId && tab.type === "file",
  );
  const targetIndex = normalized.tabs.findIndex(
    (tab) => tab.id === opts.targetTabId && tab.type === "file",
  );
  if (
    sourceIndex < 0 ||
    targetIndex < 0 ||
    opts.sourceTabId === opts.targetTabId
  ) {
    return normalized;
  }

  const tabs = [...normalized.tabs];
  const [source] = tabs.splice(sourceIndex, 1);
  const targetIndexAfterRemoval = tabs.findIndex(
    (tab) => tab.id === opts.targetTabId,
  );
  const insertIndex =
    opts.position === "before"
      ? targetIndexAfterRemoval
      : targetIndexAfterRemoval + 1;
  tabs.splice(insertIndex, 0, source);

  return {
    ...normalized,
    tabs: normalizeEditorTabsState({
      activeTabId: normalized.activeTabId,
      tabs,
    }).tabs,
  };
}

export function readEditorTabsState(): EditorTabsState {
  try {
    const raw = sessionStorage.getItem(EDITOR_TABS_STORAGE_KEY);
    return normalizeEditorTabsState(raw ? JSON.parse(raw) : null);
  } catch {
    return createInitialEditorTabsState();
  }
}

export function writeEditorTabsState(state: EditorTabsState): EditorTabsState {
  const normalized = normalizeEditorTabsState(state);
  try {
    sessionStorage.setItem(EDITOR_TABS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore storage failures; tabs are session UI state only.
  }
  window.dispatchEvent(new CustomEvent(EDITOR_TABS_CHANGE_EVENT));
  return normalized;
}
