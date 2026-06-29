import { isAddLibraryHash } from "./documentHash";
import { ExcalidrawAdapter } from "./formats/ExcalidrawAdapter";
import { editorRegistry } from "../editors";
import { isDesktopEditorHub } from "../lib/runtimePlatform";
import {
  activateTab,
  findFirstFileTabByKind,
  readEditorTabsState,
  writeEditorTabsState,
} from "../shell/editorTabs";
import type { ServerFile } from "./ServerSync";

export const LIBRARY_URL_IMPORT_DONE_EVENT = "editorhub:library-url-import-done";
const LIBRARY_RETURN_HASH_KEY = "editorhub-library-return-hash";

/** Ephemeral canvas used only while merging a remote `.excalidrawlib` from URL. */
export function createLibraryImportPlaceholderFile(): ServerFile {
  const now = new Date().toISOString();
  return {
    id: "",
    name: "",
    kind: "excalidraw",
    created_at: now,
    updated_at: now,
    data: ExcalidrawAdapter.createEmpty(),
  };
}

export function notifyLibraryUrlImportDone(): void {
  window.dispatchEvent(new CustomEvent(LIBRARY_URL_IMPORT_DONE_EVENT));
}

function rememberLibraryReturnHash(hash: string): void {
  if (!hash || isAddLibraryHash(hash)) {
    return;
  }
  try {
    sessionStorage.setItem(LIBRARY_RETURN_HASH_KEY, hash);
  } catch {
    /* ignore */
  }
}

function consumeLibraryReturnHash(): string | null {
  try {
    const hash = sessionStorage.getItem(LIBRARY_RETURN_HASH_KEY);
    sessionStorage.removeItem(LIBRARY_RETURN_HASH_KEY);
    return hash;
  } catch {
    return null;
  }
}

/**
 * URL passed to libraries.excalidraw.com as `referrer` so install redirects back
 * to the current EditorHub document (including desktop tab state).
 */
export function resolveLibraryReturnUrl(): string {
  if (typeof window === "undefined") {
    return "";
  }
  const base = `${window.location.origin}${window.location.pathname}`;

  if (isDesktopEditorHub()) {
    const state = readEditorTabsState();
    const active = state.tabs.find((tab) => tab.id === state.activeTabId);
    if (active?.type === "file") {
      const hash = editorRegistry.buildFileHash(active.fileId, active.kind);
      rememberLibraryReturnHash(hash);
      return `${base}${hash}`;
    }
  }

  const hash = window.location.hash;
  if (hash && !isAddLibraryHash(hash)) {
    rememberLibraryReturnHash(hash);
    return `${base}${hash}`;
  }

  return base;
}

/** After a remote library merge, restore the pre-install route when possible. */
export function finishLibraryUrlImportNavigation(opts?: {
  libraryImportOnly?: boolean;
}): void {
  if (isDesktopEditorHub()) {
    const state = readEditorTabsState();
    const activeFile = state.tabs.find(
      (tab) => tab.id === state.activeTabId && tab.type === "file",
    );
    const excalidrawTab =
      activeFile &&
      editorRegistry.resolveKind(activeFile.kind) === "excalidraw"
        ? activeFile
        : findFirstFileTabByKind(state, "excalidraw");

    if (excalidrawTab) {
      if (state.activeTabId !== excalidrawTab.id) {
        writeEditorTabsState(activateTab(state, excalidrawTab.id));
      }
      const targetHash = editorRegistry.buildFileHash(
        excalidrawTab.fileId,
        excalidrawTab.kind,
      );
      if (window.location.hash !== targetHash) {
        window.location.hash = targetHash;
      }
      return;
    }
  }

  const preservedHash = consumeLibraryReturnHash();
  if (preservedHash && window.location.hash !== preservedHash) {
    window.location.hash = preservedHash;
    return;
  }

  if (opts?.libraryImportOnly) {
    notifyLibraryUrlImportDone();
  }
}
