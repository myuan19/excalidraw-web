import {
  hashNeedsEditorRoute,
  isAddLibraryHash,
} from "../data/documentHash";
import { getFileIdFromHashString } from "../data/fileIdFromHash";
import { stashLibraryUrlImportFromHash } from "../data/libraryUrlImport";
import { getDocumentKindFromHash } from "../lib/appBranding";
import { isDesktopEditorHub } from "../lib/runtimePlatform";
import {
  HOME_TAB_ID,
  readEditorTabsState,
} from "../shell/editorTabs";

import type { StartupIntent } from "./startupPhases";

const SIDEBAR_VIEW_STORAGE_KEY = "editorhub-filelist-sidebar-view";
const FOLDER_STORAGE_KEY = "excalidraw-filelist-folder";

function readSidebarView(): "recent" | "all" {
  try {
    const savedView = sessionStorage.getItem(SIDEBAR_VIEW_STORAGE_KEY);
    const savedFolder = sessionStorage.getItem(FOLDER_STORAGE_KEY);
    return savedView === "all" && savedFolder ? "all" : "recent";
  } catch {
    return "recent";
  }
}

function readStoredFolderId(): string | null {
  try {
    const raw = sessionStorage.getItem(FOLDER_STORAGE_KEY);
    return raw?.trim() || null;
  } catch {
    return null;
  }
}

function readHomePrefs(): Pick<StartupIntent, "sidebarView" | "folderId"> {
  return {
    sidebarView: readSidebarView(),
    folderId: readStoredFolderId(),
  };
}

/** Lightweight peek for first shell paint — no hash writes, no network. */
export function peekStartupShellMode(): "home" | "editor" {
  const hash = typeof window !== "undefined" ? window.location.hash : "";
  if (hashNeedsEditorRoute(hash)) {
    return "editor";
  }
  if (isDesktopEditorHub()) {
    const state = readEditorTabsState();
    if (state.activeTabId !== HOME_TAB_ID) {
      const active = state.tabs.find((tab) => tab.id === state.activeTabId);
      if (active?.type === "file") {
        return "editor";
      }
    }
  }
  return "home";
}

/** Resolve cold-start intent (P1). May stash library import hash side effects. */
export function resolveStartupIntent(): StartupIntent {
  stashLibraryUrlImportFromHash();
  const hash = window.location.hash;
  const homePrefs = readHomePrefs();

  if (isAddLibraryHash(hash)) {
    return {
      mode: "library-import",
      ...homePrefs,
    };
  }

  if (hashNeedsEditorRoute(hash)) {
    const fileId = getFileIdFromHashString(hash);
    if (fileId) {
      return {
        mode: "editor",
        fileId,
        kind: getDocumentKindFromHash(hash),
        needsSessionRestore: false,
      };
    }
  }

  if (isDesktopEditorHub()) {
    const state = readEditorTabsState();
    if (state.activeTabId !== HOME_TAB_ID) {
      const active = state.tabs.find((tab) => tab.id === state.activeTabId);
      if (active?.type === "file") {
        return {
          mode: "editor",
          fileId: active.fileId,
          kind: active.kind,
          tabId: active.id,
          needsSessionRestore: !hashNeedsEditorRoute(hash),
        };
      }
    }
  }

  return {
    mode: "home",
    ...homePrefs,
  };
}
