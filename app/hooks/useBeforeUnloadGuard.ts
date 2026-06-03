import { useEffect } from "react";
import { EVENT, preventUnload } from "@excalidraw/common";

import { createLogger } from "../lib/logger";
import { FileEditDirty } from "../data/fileEditDirty";
import { FileSyncState } from "../data/FileSyncState";
import { evaluateCurrentFileModificationState } from "../data/fileModificationState";
import { LocalData } from "../data/LocalData";
import { getFileIdFromHash } from "../data/fileIdFromHash";
import { isLocalDraftFileId } from "../data/localDraftFileId";
import { notifyLocalDraftEdited } from "../data/localDraftSessions";

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
      if (fid && excalidrawAPI) {
        const sceneData = getSceneData();
        const state = evaluateCurrentFileModificationState({
          fileId: fid,
          kind: "excalidraw",
          excalidrawScene: sceneData,
        });
        if (sceneData && state.modified) {
          try {
            FileSyncState.setLocalCache(fid, {
              elements: sceneData.elements,
              appState: sceneData.appState,
              files: sceneData.files,
              deltas: [],
            });
            if (state.shouldMarkLocalDraftEdited) {
              notifyLocalDraftEdited(fid, sceneData.appState?.name?.trim());
            }
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
