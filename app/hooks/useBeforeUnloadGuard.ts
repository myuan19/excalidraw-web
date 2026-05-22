import { useEffect } from "react";
import { EVENT, preventUnload } from "@excalidraw/common";

import { createLogger } from "../lib/logger";
import { FileEditDirty } from "../data/fileEditDirty";
import { FileSyncState } from "../data/FileSyncState";
import { LocalData } from "../data/LocalData";
import { getFileIdFromHash } from "../data/fileIdFromHash";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const logHook = createLogger({ module: "hook.unloadGuard" });

export function useBeforeUnloadGuard(opts: {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  getSceneData: () => { elements: any; appState: any; files: any } | null;
  updateDraftHashDebounced: { flush: () => void };
}) {
  const { excalidrawAPI, getSceneData, updateDraftHashDebounced } = opts;

  useEffect(() => {
    logHook.info("mounted — beforeunload listener registered");
    const unloadHandler = (event: BeforeUnloadEvent) => {
      FileEditDirty.prepareForDirtyEvaluation({
        flushEmbeddedLocalFiles: () => LocalData.flushSave(),
        draftFlusher: updateDraftHashDebounced,
      });

      const fid = getFileIdFromHash();
      let didEmergencyLocalCache = false;
      if (fid && excalidrawAPI && FileEditDirty.hasUnsavedChanges(fid)) {
        const sceneData = getSceneData();
        if (sceneData) {
          try {
            FileSyncState.setLocalCache(fid, {
              elements: sceneData.elements,
              appState: sceneData.appState,
              files: sceneData.files,
              deltas: [],
            });
            didEmergencyLocalCache = true;
          } catch {
            // ignore quota / serialization errors
          }
        }
      }

      if (didEmergencyLocalCache) {
        logHook.info("beforeunload: emergency local cache written", { fileId: fid?.slice(0, 8) });
        return;
      }

      if (
        excalidrawAPI &&
        LocalData.fileStorage.shouldPreventUnload(
          excalidrawAPI.getSceneElements(),
        )
      ) {
        if (import.meta.env.VITE_APP_DISABLE_PREVENT_UNLOAD !== "true") {
          preventUnload(event);
        } else {
          console.warn(
            "preventing unload disabled (VITE_APP_DISABLE_PREVENT_UNLOAD)",
          );
        }
      }
    };
    window.addEventListener(EVENT.BEFORE_UNLOAD, unloadHandler);
    return () => {
      window.removeEventListener(EVENT.BEFORE_UNLOAD, unloadHandler);
    };
  }, [excalidrawAPI, getSceneData, updateDraftHashDebounced]);
}
