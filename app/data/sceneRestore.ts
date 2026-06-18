/**
 * Shared helpers for restoring persisted scene data (appState & elements).
 *
 * Centralises the sanitize → restoreAppState → restoreElements pipeline that
 * was previously duplicated across EditorShell.tsx.
 */

import { restoreAppState, restoreElements } from "@excalidraw/excalidraw/data/restore";
import type { AppState } from "@excalidraw/excalidraw/types";

type RestoredAppState = Omit<AppState, "offsetTop" | "offsetLeft" | "width" | "height">;
type ViewportAppState = Pick<AppState, "scrollX" | "scrollY" | "zoom">;

/**
 * Guard against non-Map collaborators that can appear in stale localStorage
 * payloads; restoreAppState chokes on plain-object collaborators.
 */
function sanitizePersistedAppState(
  raw: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const out = { ...raw };
  if ("collaborators" in out && !(out.collaborators instanceof Map)) {
    delete out.collaborators;
  }
  return out;
}

export function restoreSceneAppState(
  rawAppState: unknown,
  overlay?: Partial<AppState> | null,
): RestoredAppState {
  const sanitized = sanitizePersistedAppState(
    rawAppState as Record<string, unknown>,
  );
  const restored = restoreAppState(sanitized, null);
  return overlay ? { ...restored, ...overlay } : restored;
}

/** Current browser viewport is local UI state; remote content refreshes should not replace it. */
export function pickSceneViewportAppState(
  appState: AppState,
): ViewportAppState {
  return {
    scrollX: appState.scrollX,
    scrollY: appState.scrollY,
    zoom: appState.zoom,
  };
}

export function restoreSceneElements(rawElements: unknown) {
  return restoreElements(rawElements as any, null, {
    repairBindings: true,
    deleteInvisibleElements: true,
  });
}
