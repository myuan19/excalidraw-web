import {
  requestActiveEditorSnapshot,
  type ActiveEditorSnapshotResult,
  type ActiveEditorSnapshotSource,
} from "../data/activeEditorSnapshotBridge";
import { prepareEditorTabForClose } from "../data/editorTabLeave";
import { hashNeedsEditorRoute } from "../data/documentHash";
import {
  getFileIdFromHash,
  getFileIdFromHashString,
} from "../data/fileIdFromHash";
import { loadEditorServerFile } from "../data/loadEditorServerFile";
import { editorRegistry } from "../editors/registry";
import { isDesktopEditorHub } from "../lib/runtimePlatform";
import { traceTab, id8 } from "../lib/interactionDebugTrace";
import { buildViewHash } from "./useAppView";
import {
  activateTab,
  closeEditorTab,
  fileTabId,
  HOME_TAB_ID,
  openFileTab,
  readEditorTabsState,
  reorderFileTab,
  replaceFileTab,
  updateFileTabTitle,
  writeEditorTabsState,
} from "./editorTabs";

type SnapshotFn = (
  source: ActiveEditorSnapshotSource,
) => Promise<ActiveEditorSnapshotResult>;

type NavigateDeps = {
  snapshot?: SnapshotFn;
  getCurrentFileId?: () => string | null;
  setHash?: (hash: string) => void;
  buildFileHash?: (fileId: string, kind: string) => string;
  buildHomeHash?: () => string;
  resolveFileTitle?: (fileId: string) => Promise<string | null>;
};

type ResolvedNavigateDeps = {
  snapshot: SnapshotFn;
  getCurrentFileId: () => string | null;
  setHash: (hash: string) => void;
  buildFileHash: (fileId: string, kind: string) => string;
  buildHomeHash: () => string;
  resolveFileTitle: (fileId: string) => Promise<string | null>;
};

function resolveNavigateDeps(deps: NavigateDeps = {}): ResolvedNavigateDeps {
  return {
    snapshot: deps.snapshot ?? requestActiveEditorSnapshot,
    getCurrentFileId: deps.getCurrentFileId ?? getFileIdFromHash,
    setHash:
      deps.setHash ??
      ((hash) => {
        window.location.hash = hash;
      }),
    buildFileHash:
      deps.buildFileHash ??
      ((fileId, kind) => editorRegistry.buildFileHash(fileId, kind)),
    buildHomeHash: deps.buildHomeHash ?? (() => buildViewHash("home")),
    resolveFileTitle:
      deps.resolveFileTitle ??
      (async (fileId) => {
        const file = await loadEditorServerFile(fileId);
        return file.name || null;
      }),
  };
}

async function snapshotIfLeavingActiveFile(
  source: ActiveEditorSnapshotSource,
  deps: ResolvedNavigateDeps,
): Promise<boolean> {
  if (!deps.getCurrentFileId()) {
    return true;
  }
  if (source === "tab-switch" && isDesktopEditorHub()) {
    return true;
  }
  const result = await deps.snapshot(source);
  return result.ok;
}

function navigateToActiveTab(deps: ResolvedNavigateDeps): boolean {
  const state = readEditorTabsState();
  const active = state.tabs.find((tab) => tab.id === state.activeTabId);
  if (active?.type === "file") {
    deps.setHash(deps.buildFileHash(active.fileId, active.kind));
    return true;
  }
  deps.setHash(deps.buildHomeHash());
  return true;
}

function getKindFromHashString(hash: string): string {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  return editorRegistry.resolveKind(params.get("kind"));
}

export async function openEditorFileTab(
  file: { fileId: string; kind: string; title?: string },
  inputDeps?: NavigateDeps,
): Promise<boolean> {
  const deps = resolveNavigateDeps(inputDeps);
  const currentFileId = deps.getCurrentFileId();
  traceTab("openFileTab", {
    fileId8: id8(file.fileId),
    kind: file.kind,
    title: file.title ?? null,
    currentFileId8: id8(currentFileId),
  });
  if (
    currentFileId &&
    currentFileId !== file.fileId &&
    !(await snapshotIfLeavingActiveFile("tab-switch", deps))
  ) {
    traceTab("openFileTab", { fileId8: id8(file.fileId), reason: "snapshot-blocked" }, "fail");
    return false;
  }

  writeEditorTabsState(
    openFileTab(readEditorTabsState(), {
      ...file,
      title: file.title || "未命名",
    }),
  );
  deps.setHash(deps.buildFileHash(file.fileId, file.kind));
  if (!file.title) {
    void refreshOpenFileTabTitle(file.fileId, deps);
  }
  traceTab("openFileTab", { fileId8: id8(file.fileId), kind: file.kind }, "ok");
  return true;
}

export async function activateEditorTab(
  tabId: string,
  inputDeps?: NavigateDeps,
): Promise<boolean> {
  const deps = resolveNavigateDeps(inputDeps);
  const state = readEditorTabsState();
  const tab = state.tabs.find((item) => item.id === tabId);
  traceTab("activate", {
    tabId,
    tabType: tab?.type ?? null,
    fileId8: tab?.type === "file" ? id8(tab.fileId) : null,
    fromActiveTabId: state.activeTabId,
  });
  if (state.activeTabId === tabId) {
    traceTab("activate", { tabId, reason: "already-active" }, "skip");
    return true;
  }
  if (!(await snapshotIfLeavingActiveFile("tab-switch", deps))) {
    traceTab("activate", { tabId, reason: "snapshot-blocked" }, "fail");
    return false;
  }
  writeEditorTabsState(activateTab(state, tabId));
  const ok = navigateToActiveTab(deps);
  traceTab("activate", { tabId, hash: window.location.hash }, ok ? "ok" : "fail");
  return ok;
}

export async function closeEditorTabWithSnapshot(
  tabId: string,
  inputDeps?: NavigateDeps,
): Promise<boolean> {
  const deps = resolveNavigateDeps(inputDeps);
  const initialState = readEditorTabsState();
  const initialTab = initialState.tabs.find((item) => item.id === tabId);
  const isActive = initialState.activeTabId === tabId;
  const closingFileId =
    initialTab?.type === "file" ? initialTab.fileId : null;
  traceTab("close", {
    tabId,
    tabType: initialTab?.type ?? null,
    fileId8: closingFileId ? id8(closingFileId) : null,
    isActive,
    fromActiveTabId: initialState.activeTabId,
  });

  if (closingFileId) {
    if (!(await prepareEditorTabForClose(closingFileId))) {
      traceTab("close", { tabId, fileId8: id8(closingFileId), reason: "prepare-failed" }, "fail");
      return false;
    }
  } else if (
    isActive &&
    !(await snapshotIfLeavingActiveFile("tab-close", deps))
  ) {
    traceTab("close", { tabId, reason: "snapshot-blocked" }, "fail");
    return false;
  }

  const state = readEditorTabsState();
  let tabToClose =
    state.tabs.find((item) => item.id === tabId) ??
    (closingFileId
      ? state.tabs.find(
          (item) => item.type === "file" && item.fileId === closingFileId,
        )
      : undefined);
  if (!tabToClose && closingFileId) {
    const initialIndex = initialState.tabs.findIndex((item) => item.id === tabId);
    const candidate =
      initialIndex >= 0 ? state.tabs[initialIndex] : undefined;
    if (candidate?.type === "file" && candidate.id !== tabId) {
      tabToClose = candidate;
    }
  }
  if (!tabToClose) {
    traceTab("close", { tabId, reason: "already-closed" }, "ok");
    return true;
  }

  writeEditorTabsState(closeEditorTab(state, tabToClose.id));
  if (!isActive) {
    traceTab("close", { tabId: tabToClose.id, background: true }, "ok");
    return true;
  }
  const ok = navigateToActiveTab(deps);
  traceTab("close", { tabId: tabToClose.id, hash: window.location.hash }, ok ? "ok" : "fail");
  return ok;
}

export async function activateHomeTab(
  inputDeps?: NavigateDeps,
): Promise<boolean> {
  return activateEditorTab("home", inputDeps);
}

export function activateHomeTabWithoutSnapshot(
  inputDeps?: Pick<NavigateDeps, "setHash" | "buildHomeHash">,
): void {
  const deps = resolveNavigateDeps(inputDeps);
  writeEditorTabsState(activateTab(readEditorTabsState(), HOME_TAB_ID));
  deps.setHash(deps.buildHomeHash());
}

export function replaceOpenFileTabAfterSave(opts: {
  fromFileId: string;
  toFileId: string;
  kind: string;
  title: string;
}): void {
  writeEditorTabsState(replaceFileTab(readEditorTabsState(), opts));
}

export function reorderOpenFileTab(opts: {
  sourceTabId: string;
  targetTabId: string;
  position: "before" | "after";
}): void {
  writeEditorTabsState(reorderFileTab(readEditorTabsState(), opts));
}

export function renameOpenFileTab(fileId: string, title: string): void {
  const trimmed = title.trim();
  if (!trimmed) {
    return;
  }
  writeEditorTabsState(
    updateFileTabTitle(readEditorTabsState(), { fileId, title: trimmed }),
  );
}

export async function refreshOpenFileTabTitle(
  fileId: string,
  inputDeps?: Pick<NavigateDeps, "resolveFileTitle">,
): Promise<void> {
  const deps = resolveNavigateDeps(inputDeps);
  try {
    const title = await deps.resolveFileTitle(fileId);
    if (!title) {
      return;
    }
    writeEditorTabsState(updateFileTabTitle(readEditorTabsState(), { fileId, title }));
  } catch {
    // Title sync is cosmetic; editor loading owns missing-file/error handling.
  }
}

export function removeMissingEditorFileTab(
  fileId: string,
  inputDeps?: Pick<NavigateDeps, "setHash" | "buildHomeHash">,
): void {
  const deps = resolveNavigateDeps(inputDeps);
  const state = readEditorTabsState();
  const missingTabId = fileTabId(fileId);
  if (!state.tabs.some((tab) => tab.id === missingTabId)) {
    return;
  }

  const wasActive = state.activeTabId === missingTabId;
  writeEditorTabsState({
    activeTabId: wasActive ? HOME_TAB_ID : state.activeTabId,
    tabs: state.tabs.filter((tab) => tab.id !== missingTabId),
  });
  if (wasActive) {
    deps.setHash(deps.buildHomeHash());
  }
}

export function reconcileEditorTabsWithHash(
  hash = window.location.hash,
  inputDeps?: Pick<NavigateDeps, "resolveFileTitle">,
): void {
  const fileId = getFileIdFromHashString(hash);
  if (fileId) {
    const kind = getKindFromHashString(hash);
    writeEditorTabsState(
      openFileTab(readEditorTabsState(), {
        fileId,
        kind,
        title: "未命名",
      }),
    );
    void refreshOpenFileTabTitle(fileId, inputDeps);
    return;
  }
  if (hashNeedsEditorRoute(hash)) {
    return;
  }
  writeEditorTabsState(activateTab(readEditorTabsState(), HOME_TAB_ID));
}
