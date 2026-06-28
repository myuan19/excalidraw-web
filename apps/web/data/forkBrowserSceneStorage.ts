/**
 * Per-file browser snapshot in localStorage — mirrors upstream app's
 * strategy of saving non-deleted elements + clearAppStateForLocalStorage(appState)
 * together (upstream Excalidraw local persistence).
 *
 * Fork uses one JSON blob per fileId so updates stay atomic and multi-file tabs
 * do not collide with global LOCAL_STORAGE_* keys.
 */

import { clearAppStateForLocalStorage } from "@excalidraw/excalidraw/appState";
import { restoreAppState } from "@excalidraw/excalidraw/data/restore";
import { getNonDeletedElements } from "@excalidraw/element";
import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";

const STORAGE_PREFIX = "fork-browser-scene-v1-";

function storageKey(fileId: string): string {
  return `${STORAGE_PREFIX}${fileId}`;
}

/** Fork does not persist library sidebar open/docked UI between opens. */
function clearAppStateForForkBrowserPersist(appState: AppState) {
  const cleared = clearAppStateForLocalStorage(appState);
  delete cleared.openSidebar;
  delete cleared.defaultSidebarDockedPreference;
  return cleared;
}

function stripPersistedSidebarState(
  overlay: Partial<AppState>,
): Partial<AppState> {
  const next = { ...overlay };
  delete next.openSidebar;
  delete next.defaultSidebarDockedPreference;
  return next;
}

export type ForkBrowserScenePayloadV1 = {
  v: 1;
  elements: ReturnType<typeof getNonDeletedElements>;
  appState: ReturnType<typeof clearAppStateForLocalStorage>;
};

export function saveForkBrowserScene(
  fileId: string,
  elements: readonly ExcalidrawElement[],
  appState: AppState,
): void {
  try {
    const payload: ForkBrowserScenePayloadV1 = {
      v: 1,
      elements: getNonDeletedElements(elements),
      appState: clearAppStateForForkBrowserPersist(appState),
    };
    localStorage.setItem(storageKey(fileId), JSON.stringify(payload));
  } catch {
    // quota / private mode
  }
}

/**
 * Returns restored browser appState to merge over the scene loaded from server/cache.
 * Uses restoreAppState on stored cleared appState from the v1 snapshot.
 */
export function clearForkBrowserScene(fileId: string): void {
  try {
    localStorage.removeItem(storageKey(fileId));
  } catch {
    // ignore
  }
}

export function readForkBrowserAppStateOverlay(fileId: string): Partial<AppState> | null {
  try {
    const raw = localStorage.getItem(storageKey(fileId));
    if (raw) {
      const p = JSON.parse(raw) as Partial<ForkBrowserScenePayloadV1>;
      if (p?.v === 1 && p.appState && typeof p.appState === "object") {
        const overlay = stripPersistedSidebarState(
          restoreAppState(
            p.appState as Partial<AppState>,
            null,
          ) as Partial<AppState>,
        );
        return Object.keys(overlay).length > 0 ? overlay : null;
      }
    }
  } catch {
    // ignore
  }

  return null;
}

export function copyForkBrowserSceneBetweenFiles(
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
