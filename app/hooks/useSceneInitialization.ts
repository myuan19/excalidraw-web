import { useCallback, useEffect, useRef } from "react";
import {
  EVENT,
  resolvablePromise,
} from "@excalidraw/common";
import { getAppSettings } from "../data/appSettings";
import { registerAutoSaveTrigger } from "../data/autoSaveSession";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import {
  parseLibraryTokensFromUrl,
} from "@excalidraw/excalidraw/data/library";
import { isInitializedImageElement } from "@excalidraw/element";
import { type StoreDelta } from "@excalidraw/element";
import { cleanAppStateForExport } from "@excalidraw/excalidraw/appState";

import type { FileId } from "@excalidraw/element/types";
import type {
  ExcalidrawImperativeAPI,
  BinaryFiles,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import type { ResolvablePromise } from "@excalidraw/common/utils";

import { createLogger } from "../lib/logger";
import { DeltaStorage } from "../data/DeltaStorage";
import { FileEditDirty, VISIBILITY_BACKGROUND_SAVE_DELAY_MS } from "../data/fileEditDirty";
import { FileSyncState } from "../data/FileSyncState";
import { hashSceneSnapshot } from "../data/sceneHash";
import { LocalData } from "../data/LocalData";
import { updateStaleImageStatuses } from "../data/FileManager";
import { persistDtoToStoreDelta } from "../data/storeDeltaPersist";
import { revealForkCanvasAfterFit } from "../data/scrollEditorToFit";
import { restoreSceneAppState, restoreSceneElements } from "../data/sceneRestore";
import {
  getFileIdFromHash,
  getFileIdFromUrl,
} from "../data/fileIdFromHash";
import {
  initializeExcalidrawScene,
  verifyExcalidrawRemoteAfterCachedOpen,
  type ExcalidrawInitSceneResult,
} from "../editors/excalidraw/initializeExcalidrawScene";
import type { EditorOpenPhase } from "../lib/editorOpenPhases";

import type { SaveToServerOptions, SceneData } from "./types";

const logHash = createLogger({ module: "hash" });
const logHook = createLogger({ module: "hook.sceneInit" });

export function useSceneInitialization(opts: {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  onOpenPhase?: (phase: EditorOpenPhase) => void;
  updateDraftHashDebouncedRef: React.MutableRefObject<{ flush: () => void; cancel: () => void } & ((...args: any[]) => void)>;
  localPersistGenRef: React.MutableRefObject<number>;
  saveToServerRef: React.MutableRefObject<(opts?: SaveToServerOptions) => Promise<boolean>>;
  visibilitySaveInFlightRef: React.MutableRefObject<boolean>;
}) {
  const {
    excalidrawAPI,
    onOpenPhase,
    updateDraftHashDebouncedRef,
    localPersistGenRef,
    saveToServerRef,
    visibilitySaveInFlightRef,
  } = opts;

  const initialStatePromiseRef = useRef<{
    promise: ResolvablePromise<ExcalidrawInitialDataState | null>;
  }>({ promise: null! });
  if (!initialStatePromiseRef.current.promise) {
    initialStatePromiseRef.current.promise =
      resolvablePromise<ExcalidrawInitialDataState | null>();
  }

  const loadImages = useCallback(
    (data: ExcalidrawInitSceneResult, isInitialLoad = false) => {
      if (!data.scene || !excalidrawAPI) {
        return;
      }

      const fileIds =
        data.scene.elements?.reduce((acc, element) => {
          if (isInitializedImageElement(element)) {
            return acc.concat(element.fileId);
          }
          return acc;
        }, [] as FileId[]) || [];

      if (isInitialLoad) {
        if (fileIds.length) {
          LocalData.fileStorage
            .getFiles(fileIds)
            .then(async ({ loadedFiles, erroredFiles }) => {
              if (loadedFiles.length) {
                excalidrawAPI.addFiles(loadedFiles);
              }
              updateStaleImageStatuses({
                excalidrawAPI,
                erroredFiles,
                elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
              });
            });
        }
        LocalData.fileStorage.clearObsoleteFiles({
          currentFileIds: fileIds,
        });
      }
    },
    [excalidrawAPI],
  );

  const getSceneData = useCallback((): SceneData | null => {
    if (!excalidrawAPI) {
      return null;
    }
    try {
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();
      return {
        elements,
        appState: cleanAppStateForExport(appState),
        files,
      };
    } catch {
      return null;
    }
  }, [excalidrawAPI]);

  const restorePersistedUndoStack = useCallback(
    async (api: ExcalidrawImperativeAPI) => {
      if (!getFileIdFromHash()) {
        return;
      }
      const dtos = await DeltaStorage.getAllPersistedDtos();
      const deltas: StoreDelta[] = [];
      for (const dto of dtos) {
        const d = persistDtoToStoreDelta(dto);
        if (d && !d.isEmpty()) {
          deltas.push(d);
        }
      }
      if (deltas.length > 0) {
        queueMicrotask(() => api.restoreUndoStackFromDeltas(deltas));
      }
    },
    [],
  );

  // Normalize hashes after scene is loaded
  const normalizeHashesAfterLoad = useCallback(() => {
    const fid = getFileIdFromHash();
    if (!fid) return;
    const scene = getSceneData();
    if (!scene) return;
    const h = hashSceneSnapshot(scene);
    const b = FileSyncState.getBaselineHash(fid);
    const d = FileSyncState.getDraftHash(fid);
    if (!b || (b === d)) {
      FileSyncState.alignHashes(fid, h);
      const existing = FileSyncState.getLocalCache(fid);
      FileSyncState.setLocalCache(fid, {
        elements: scene.elements,
        appState: scene.appState,
        files: scene.files,
        deltas: existing?.deltas ?? [],
      });
      logHash.debug(`normalize file=${fid.slice(0, 8)}, hash=${h.slice(0, 8)}`);
    }
  }, [getSceneData]);

  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }
    logHook.info("mounted — registering hashchange / unload / visibility listeners");

    const finishOpen = async (data: ExcalidrawInitSceneResult) => {
      loadImages(data, true);
      initialStatePromiseRef.current.promise.resolve(data.scene);
      await restorePersistedUndoStack(excalidrawAPI);
      revealForkCanvasAfterFit(excalidrawAPI, () => {}, {
        skipFit: data.hasBrowserViewport,
      });
      setTimeout(normalizeHashesAfterLoad, 100);
      logHook.info("scene loaded", {
        hasScene: !!data.scene,
        hasBrowserViewport: data.hasBrowserViewport,
        deferRemoteVerify: data.deferRemoteVerify,
        elementCount: data.scene?.elements?.length ?? 0,
      });
      if (data.deferRemoteVerify) {
        void verifyExcalidrawRemoteAfterCachedOpen({
          excalidrawAPI,
          onPhase: onOpenPhase,
        });
      } else {
        onOpenPhase?.("ready");
      }
    };

    initializeExcalidrawScene({ onPhase: onOpenPhase }).then(finishOpen);

    const onHashChange = async (event: HashChangeEvent) => {
      const newFileId = getFileIdFromUrl(event.newURL);

      event.preventDefault();
      const libraryUrlTokens = parseLibraryTokensFromUrl();
      if (!libraryUrlTokens) {
        excalidrawAPI.updateScene({ appState: { isLoading: true } });
        onOpenPhase?.("resolving");

        const finishHashOpen = async (data: ExcalidrawInitSceneResult) => {
          loadImages(data, !!newFileId);
          if (data.scene) {
            excalidrawAPI.updateScene({
              elements: restoreSceneElements(data.scene.elements),
              appState: {
                ...restoreSceneAppState(data.scene.appState),
                isLoading: false,
              },
              captureUpdate: CaptureUpdateAction.IMMEDIATELY,
            });
            const sceneFiles = (data.scene.files ?? {}) as BinaryFiles;
            if (Object.keys(sceneFiles).length > 0) {
              excalidrawAPI.addFiles(Object.values(sceneFiles));
            }
          } else {
            excalidrawAPI.updateScene({
              appState: { isLoading: false },
              captureUpdate: CaptureUpdateAction.IMMEDIATELY,
            });
          }
          await restorePersistedUndoStack(excalidrawAPI);
          revealForkCanvasAfterFit(excalidrawAPI, () => {}, {
            skipFit: data.hasBrowserViewport,
          });
          setTimeout(() => {
            const fid = getFileIdFromHash();
            if (!fid) {
              return;
            }
            const b = FileSyncState.getBaselineHash(fid);
            const d = FileSyncState.getDraftHash(fid);
            if (b && d && b === d) {
              const scene = getSceneData();
              if (scene) {
                FileSyncState.alignHashes(fid, hashSceneSnapshot(scene));
              }
            }
          }, 100);
          if (data.deferRemoteVerify) {
            void verifyExcalidrawRemoteAfterCachedOpen({
              excalidrawAPI,
              onPhase: onOpenPhase,
            });
          } else {
            onOpenPhase?.("ready");
          }
        };

        initializeExcalidrawScene({ onPhase: onOpenPhase }).then(finishHashOpen);
      }
    };

    const onUnload = () => {
      LocalData.flushSave();
    };

    let visibilityFlushTimer: number | null = null;
    const onVisibilityChange = () => {
      if (visibilityFlushTimer != null) {
        window.clearTimeout(visibilityFlushTimer);
        visibilityFlushTimer = null;
      }
      if (!document.hidden) {
        return;
      }
      if (!getAppSettings().autoSaveOnBlur) {
        return;
      }
      visibilityFlushTimer = window.setTimeout(() => {
        visibilityFlushTimer = null;
        if (document.hidden) {
          logHook.info("visibility hidden — running background save pipeline");
          FileEditDirty.runVisibilityHiddenSavePipeline({
            flushEmbeddedLocalFiles: () => LocalData.flushSave(),
            draftFlusher: updateDraftHashDebouncedRef.current,
            fileId: getFileIdFromHash(),
            uploadInFlight: visibilitySaveInFlightRef.current,
            onShouldUpload: () => {
              void saveToServerRef.current?.({ source: "visibility" });
            },
          });
        }
      }, VISIBILITY_BACKGROUND_SAVE_DELAY_MS);
    };

    const unregisterAutoSave = registerAutoSaveTrigger(() => {
      void saveToServerRef.current?.({ source: "auto" });
    });

    window.addEventListener(EVENT.HASHCHANGE, onHashChange, false);
    window.addEventListener(EVENT.UNLOAD, onUnload, false);
    document.addEventListener(
      EVENT.VISIBILITY_CHANGE,
      onVisibilityChange,
      false,
    );
    return () => {
      if (visibilityFlushTimer != null) {
        window.clearTimeout(visibilityFlushTimer);
      }
      unregisterAutoSave();
      window.removeEventListener(EVENT.HASHCHANGE, onHashChange, false);
      window.removeEventListener(EVENT.UNLOAD, onUnload, false);
      document.removeEventListener(
        EVENT.VISIBILITY_CHANGE,
        onVisibilityChange,
        false,
      );
    };
  }, [
    excalidrawAPI,
    loadImages,
    getSceneData,
    restorePersistedUndoStack,
    normalizeHashesAfterLoad,
    onOpenPhase,
    updateDraftHashDebouncedRef,
    saveToServerRef,
    visibilitySaveInFlightRef,
  ]);

  return {
    initialDataPromise: initialStatePromiseRef.current.promise,
    getSceneData,
    loadImages,
  };
}
