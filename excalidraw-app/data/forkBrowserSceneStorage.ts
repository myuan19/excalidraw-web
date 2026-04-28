/**
 * Per-file browser snapshot in localStorage — mirrors upstream excalidraw-app's
 * strategy of saving non-deleted elements + clearAppStateForLocalStorage(appState)
 * together (see LocalData.saveDataStateToLocalStorage in github/excalidraw).
 *
 * Fork uses one JSON blob per fileId so updates stay atomic and multi-file tabs
 * do not collide with global LOCAL_STORAGE_* keys.
 */

import { clearAppStateForLocalStorage } from "@excalidraw/excalidraw/appState";
import { restoreAppState } from "@excalidraw/excalidraw/data/restore";
import { getNonDeletedElements } from "@excalidraw/element";
import { getNormalizedZoom } from "@excalidraw/excalidraw/scene";
import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";

const STORAGE_PREFIX = "fork-browser-scene-v1-";

/** Legacy viewport-only key (superseded by full browser snapshot). */
const LEGACY_VIEWPORT_PREFIX = "excal-vp-";

function storageKey(fileId: string): string {
  return `${STORAGE_PREFIX}${fileId}`;
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
      appState: clearAppStateForLocalStorage(appState),
    };
    localStorage.setItem(storageKey(fileId), JSON.stringify(payload));
  } catch {
    // quota / private mode
  }
}

/**
 * Returns restored browser appState to merge over the scene loaded from server/cache.
 * If a v1 snapshot exists, uses restoreAppState on stored cleared appState.
 * Else tries legacy excal-vp-{id} (scrollX/Y/zoom only).
 */
export function readForkBrowserAppStateOverlay(fileId: string): Partial<AppState> | null {
  try {
    const raw = localStorage.getItem(storageKey(fileId));
    if (raw) {
      const p = JSON.parse(raw) as Partial<ForkBrowserScenePayloadV1>;
      if (p?.v === 1 && p.appState && typeof p.appState === "object") {
        return restoreAppState(p.appState as Partial<AppState>, null) as Partial<AppState>;
      }
    }
  } catch {
    // ignore
  }

  try {
    const legacyRaw = localStorage.getItem(`${LEGACY_VIEWPORT_PREFIX}${fileId}`);
    if (!legacyRaw) {
      return null;
    }
    const p = JSON.parse(legacyRaw);
    if (
      typeof p?.scrollX === "number" &&
      typeof p?.scrollY === "number" &&
      typeof p?.zoomValue === "number"
    ) {
      return {
        scrollX: p.scrollX,
        scrollY: p.scrollY,
        zoom: { value: getNormalizedZoom(p.zoomValue) },
      } as Partial<AppState>;
    }
  } catch {
    // ignore
  }

  return null;
}
