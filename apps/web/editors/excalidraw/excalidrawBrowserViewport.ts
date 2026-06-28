import { debounce } from "@excalidraw/common";
import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";

import { isExcalidrawDraftDirty } from "../../data/draftDirty";
import {
  clearForkBrowserScene,
  readForkBrowserAppStateOverlay,
  saveForkBrowserScene,
} from "../../data/forkBrowserSceneStorage";
import type { ForkSceneSnapshot } from "../../data/forkFileTypes";
import { isLocalDraftFileId } from "../../data/localDraftFileId";

const SAVE_DEBOUNCE_MS = 300;

let pendingBrowserSceneSave: {
  fileId: string;
  elements: readonly ExcalidrawElement[];
  appState: AppState;
} | null = null;

const debouncedSaveBrowserScene = debounce(() => {
  if (!pendingBrowserSceneSave) {
    return;
  }
  const { fileId, elements, appState } = pendingBrowserSceneSave;
  saveForkBrowserScene(fileId, elements, appState);
  pendingBrowserSceneSave = null;
}, SAVE_DEBOUNCE_MS);

/** Restore scroll/zoom overlay; skip for clean local drafts. */
export function resolveExcalidrawBrowserViewportOverlay(
  fileId: string,
  scene: ForkSceneSnapshot | null | undefined,
): Partial<AppState> | null {
  if (isLocalDraftFileId(fileId) && !isExcalidrawDraftDirty(scene)) {
    clearForkBrowserScene(fileId);
    return null;
  }
  return readForkBrowserAppStateOverlay(fileId);
}

export function scheduleExcalidrawBrowserSceneSave(
  fileId: string,
  elements: unknown,
  appState: unknown,
): void {
  if (!Array.isArray(elements) || !appState || typeof appState !== "object") {
    return;
  }
  pendingBrowserSceneSave = {
    fileId,
    elements: elements as readonly ExcalidrawElement[],
    appState: appState as AppState,
  };
  debouncedSaveBrowserScene();
}

export function flushExcalidrawBrowserSceneSave(): void {
  debouncedSaveBrowserScene.flush();
}
