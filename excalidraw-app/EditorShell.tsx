import {
  Excalidraw,
  TTDDialogTrigger,
  CaptureUpdateAction,
  ExcalidrawAPIProvider,
  useExcalidrawAPI,
} from "@excalidraw/excalidraw";
import { trackEvent } from "@excalidraw/excalidraw/analytics";
import { debugLog } from "./data/debugLog";
import { cleanAppStateForExport } from "@excalidraw/excalidraw/appState";
import {
  CommandPalette,
  DEFAULT_CATEGORIES,
} from "@excalidraw/excalidraw/components/CommandPalette/CommandPalette";
import { ErrorDialog } from "@excalidraw/excalidraw/components/ErrorDialog";
import { OverwriteConfirmDialog } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirm";
import {
  EVENT,
  THEME,
  VERSION_TIMEOUT,
  debounce,
  getVersion,
  getFrame,
  preventUnload,
  resolvablePromise,
  isDevEnv,
} from "@excalidraw/common";
import polyfill from "@excalidraw/excalidraw/polyfill";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@excalidraw/excalidraw/i18n";
import { isElementLink } from "@excalidraw/element";
import { restoreAppState, restoreElements } from "@excalidraw/excalidraw/data/restore";
import { newElementWith, StoreIncrement, type StoreDelta } from "@excalidraw/element";
import { isInitializedImageElement } from "@excalidraw/element";
import {
  parseLibraryTokensFromUrl,
  useHandleLibrary,
} from "@excalidraw/excalidraw/data/library";

import type {
  FileId,
  NonDeletedExcalidrawElement,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";
import type {
  AppState,
  ExcalidrawImperativeAPI,
  BinaryFiles,
  ExcalidrawInitialDataState,
  UIAppState,
  ExcalidrawProps,
} from "@excalidraw/excalidraw/types";
import type { ResolutionType } from "@excalidraw/common/utility-types";
import type { ResolvablePromise } from "@excalidraw/common/utils";

import CustomStats from "./CustomStats";
import { useAtomValue } from "./app-jotai";
import { AppFooter } from "./components/AppFooter";
import { AppMainMenu } from "./components/AppMainMenu";
import { AppWelcomeScreen } from "./components/AppWelcomeScreen";

import { updateStaleImageStatuses } from "./data/FileManager";
import { FileStatusStore } from "./data/fileStatusStore";
import { LocalData, localStorageQuotaExceededAtom } from "./data/LocalData";
import { useHandleAppTheme } from "./useHandleAppTheme";
import { useAppLangCode } from "./app-language/language-state";
import DebugCanvas, {
  debugRenderer,
  isVisualDebuggerEnabled,
  loadSavedDebugState,
} from "./components/DebugCanvas";
import { AIComponents } from "./components/AI";

import { AppSidebar } from "./components/AppSidebar";
import { smallHouseIcon, toolbarSaveIcon } from "./components/appToolbarIcons";
import { ArchivePanel } from "./components/ArchivePanel";
import "./components/ExcalToolbar.scss";
import "./components/ForkLibrarySidebar.scss";
import {
  mountLibraryGroupEnhancer,
  syncLibraryItems,
  autoCreateGroupFromUrlImport,
} from "./components/LibraryGroupEnhancer";
import {
  CombinedLibraryAdapter,
  setCombinedLibraryFileId,
} from "./data/CombinedLibraryAdapter";
import { mountLibraryAIActions } from "./data/libraryAIMount";
import { DeltaStorage } from "./data/DeltaStorage";
import { FileEditDirty, VISIBILITY_BACKGROUND_SAVE_DELAY_MS } from "./data/fileEditDirty";
import { discardLocalEditsNavigateHome } from "./data/fileEditSession";
import { FileSyncState } from "./data/FileSyncState";
import { revealForkCanvasAfterFit } from "./data/scrollEditorToFit";
import { buildSceneThumbnailSvg } from "./data/thumbnailSvg";
import type { ForkSceneSnapshot } from "./data/forkFileTypes";
import { resolveSaveDisplayName } from "./data/forkFileNaming";
import { LocalThumbnailCache } from "./data/localThumbnailCache";
import { readForkBrowserAppStateOverlay } from "./data/forkBrowserSceneStorage";
import { hashSceneSnapshot } from "./data/sceneHash";
import { ServerSync } from "./data/ServerSync";
import { persistDtoToStoreDelta } from "./data/storeDeltaPersist";
import {
  getFileIdFromHash,
  getFileIdFromHashString,
  getFileIdFromUrl,
} from "./data/fileIdFromHash";

// ---------------------------------------------------------------------------
// Module-level side effects (run once when chunk is loaded)
// ---------------------------------------------------------------------------

polyfill();

window.EXCALIDRAW_THROTTLE_RENDER = true;

declare global {
  interface BeforeInstallPromptEventChoiceResult {
    outcome: "accepted" | "dismissed";
  }

  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<BeforeInstallPromptEventChoiceResult>;
  }

  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

let pwaEvent: BeforeInstallPromptEvent | null = null;

window.addEventListener(
  "beforeinstallprompt",
  (event: BeforeInstallPromptEvent) => {
    event.preventDefault();
    pwaEvent = event;
  },
);

let isSelfEmbedding = false;

if (window.self !== window.top) {
  try {
    const parentUrl = new URL(document.referrer);
    const currentUrl = new URL(window.location.href);
    if (parentUrl.origin === currentUrl.origin) {
      isSelfEmbedding = true;
    }
  } catch (error) {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizePersistedAppState(raw: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const out = { ...raw };
  if ("collaborators" in out && !(out.collaborators instanceof Map)) {
    delete out.collaborators;
  }
  return out;
}

const initializeScene = async (opts: {
  excalidrawAPI: ExcalidrawImperativeAPI;
}): Promise<{
  scene: ExcalidrawInitialDataState | null;
  isExternalScene: false;
  hasBrowserViewport: boolean;
}> => {
  const fileIdFromHash = getFileIdFromHash();
  if (fileIdFromHash) {
    const fid8 = fileIdFromHash.slice(0, 8);
    debugLog.init(`initializeScene file=${fid8}`);
    await DeltaStorage.setFileId(fileIdFromHash);
    const localRecord = FileSyncState.getLocalCache(fileIdFromHash);
    const localElements = Array.isArray((localRecord as any)?.elements)
      ? ((localRecord as any).elements as unknown[])
      : [];
    const localHasContent = localElements.length > 0;
    debugLog.init(`file=${fid8} localHasContent=${localHasContent}, localElements=${localElements.length}`);

    const forkBrowserOverlay = readForkBrowserAppStateOverlay(fileIdFromHash);

    let serverNewerThanLocal = false;
    try {
      const hashes = await ServerSync.listFileHashes();
      const entry = hashes.find((h) => h.id === fileIdFromHash);
      if (entry?.content_sha256) {
        serverNewerThanLocal = FileSyncState.isServerChanged(
          fileIdFromHash,
          entry.content_sha256,
        );
        debugLog.init(`file=${fid8} serverSha=${entry.content_sha256.slice(0, 8)}, serverNewer=${serverNewerThanLocal}`);
      } else {
        debugLog.init(`file=${fid8} no server sha256 found`);
      }
    } catch {
      debugLog.init(`file=${fid8} hash fetch failed (offline?)`);
    }

    if (localHasContent && !serverNewerThanLocal) {
      const data = localRecord!;
      const draftH = hashSceneSnapshot({
        elements: data.elements,
        appState: data.appState,
        files: data.files,
      });
      const existingBaseline = FileSyncState.getBaselineHash(fileIdFromHash);
      if (!existingBaseline) {
        FileSyncState.setBaselineHash(fileIdFromHash, draftH);
      }
      FileSyncState.setDraftHash(fileIdFromHash, draftH);
      debugLog.init(`file=${fid8} → use LOCAL cache, hash=${draftH.slice(0, 8)}, existingBaseline=${existingBaseline?.slice(0, 8) ?? "none"}`);
      await DeltaStorage.restoreSnapshot(data.deltas);
      const restoredLocal1 = restoreAppState(sanitizePersistedAppState(data.appState as any) as any, null);
      return {
        scene: {
          elements: restoreElements(data.elements as any, null, {
            repairBindings: true,
            deleteInvisibleElements: true,
          }),
          appState: forkBrowserOverlay ? { ...restoredLocal1, ...forkBrowserOverlay } : restoredLocal1,
          files: (data.files || {}) as any,
          ...(forkBrowserOverlay ? {} : { scrollToContent: true }),
        },
        isExternalScene: false,
        hasBrowserViewport: !!forkBrowserOverlay,
      };
    }

    let serverData: ForkSceneSnapshot | null = null;
    let serverRecord: Awaited<ReturnType<typeof ServerSync.getFile>> | null =
      null;
    try {
      serverRecord = await ServerSync.getFile(fileIdFromHash);
      if (serverRecord.data && typeof serverRecord.data === "object") {
        serverData = serverRecord.data as ForkSceneSnapshot;
      }
      debugLog.init(`file=${fid8} server fetch ok, hasData=${!!serverData}, elements=${Array.isArray(serverData?.elements) ? serverData.elements.length : 0}`);
    } catch (err) {
      debugLog.init(`file=${fid8} server fetch failed`, err);
    }

    if (localHasContent && !serverData) {
      const data = localRecord!;
      const draftH = hashSceneSnapshot({
        elements: data.elements,
        appState: data.appState,
        files: data.files,
      });
      FileSyncState.setBaselineHash(fileIdFromHash, draftH);
      FileSyncState.setDraftHash(fileIdFromHash, draftH);
      debugLog.init(`file=${fid8} → use LOCAL (no server data), hash=${draftH.slice(0, 8)}`);
      await DeltaStorage.restoreSnapshot(data.deltas);
      const restoredLocal2 = restoreAppState(sanitizePersistedAppState(data.appState as any) as any, null);
      return {
        scene: {
          elements: restoreElements(data.elements as any, null, {
            repairBindings: true,
            deleteInvisibleElements: true,
          }),
          appState: forkBrowserOverlay ? { ...restoredLocal2, ...forkBrowserOverlay } : restoredLocal2,
          files: (data.files || {}) as any,
          ...(forkBrowserOverlay ? {} : { scrollToContent: true }),
        },
        isExternalScene: false,
        hasBrowserViewport: !!forkBrowserOverlay,
      };
    }

    if (serverData) {
      const data = serverData;
      const mergedAppState = {
        ...(data.appState ?? {}),
        name: serverRecord?.name ?? (data.appState as any)?.name ?? "",
      };
      const h = hashSceneSnapshot(data);
      FileSyncState.setBaselineHash(fileIdFromHash, h);
      FileSyncState.setDraftHash(fileIdFromHash, h);
      if (serverRecord?.content_sha256) {
        FileSyncState.setServerHash(fileIdFromHash, serverRecord.content_sha256);
      }
      FileSyncState.setLocalCache(fileIdFromHash, {
        elements: data.elements,
        appState: mergedAppState,
        files: data.files,
        deltas: [],
      });
      debugLog.init(`file=${fid8} → use SERVER data, hash=${h.slice(0, 8)}, baseline=draft=${h.slice(0, 8)}`);
      await DeltaStorage.restoreSnapshot([]);
      const restoredServer = restoreAppState(sanitizePersistedAppState(mergedAppState as any) as any, null);
      return {
        scene: {
          elements: restoreElements(data.elements as any, null, {
            repairBindings: true,
            deleteInvisibleElements: true,
          }),
          appState: forkBrowserOverlay ? { ...restoredServer, ...forkBrowserOverlay } : restoredServer,
          files: (data.files || {}) as any,
          ...(forkBrowserOverlay ? {} : { scrollToContent: true }),
        },
        isExternalScene: false,
        hasBrowserViewport: !!forkBrowserOverlay,
      };
    }

    debugLog.init(`file=${fid8} → EMPTY scene (no local, no server)`);
    return {
      scene: {
        elements: [],
        appState: {},
        scrollToContent: true,
      },
      isExternalScene: false,
      hasBrowserViewport: false,
    };
  }

  return {
    scene: {
      elements: [],
      appState: {},
      scrollToContent: true,
    },
    isExternalScene: false,
    hasBrowserViewport: false,
  };
};

type SaveToServerSource =
  | "toolbar"
  | "hotkey"
  | "visibility"
  | "home";

type SaveToServerOptions = {
  /** What triggered the save (controls toasts and no-op behavior). */
  source?: SaveToServerSource;
  /** After a successful upload, go to file list (used by 主页). */
  navigateAfter?: boolean;
};

// ---------------------------------------------------------------------------
// ExcalidrawWrapper — the full editor component
// ---------------------------------------------------------------------------

const ExcalidrawWrapper = () => {
  const excalidrawAPI = useExcalidrawAPI();

  const forkFileId = getFileIdFromHash();
  const [forkCanvasRevealed, setForkCanvasRevealed] = useState(
    () => !getFileIdFromHash(),
  );

  useEffect(() => {
    setForkCanvasRevealed(!forkFileId);
  }, [forkFileId]);

  const [forkHomeNavDialogOpen, setForkHomeNavDialogOpen] = useState(false);

  useEffect(() => {
    setForkHomeNavDialogOpen(false);
  }, [forkFileId]);

  const [errorMessage, setErrorMessage] = useState("");
  const [forkSaving, setForkSaving] = useState(false);
  const [forkSaveHint, setForkSaveHint] = useState<string | null>(null);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const skipLeaveStashOnceRef = useRef(false);
  const saveToServerRef = useRef<
    (opts?: SaveToServerOptions) => Promise<boolean>
  >(() => Promise.resolve(false));
  const visibilitySaveInFlightRef = useRef(false);

  const { editorTheme, appTheme, setAppTheme } = useHandleAppTheme();

  const [langCode] = useAppLangCode();

  // initial state
  // ---------------------------------------------------------------------------

  const initialStatePromiseRef = useRef<{
    promise: ResolvablePromise<ExcalidrawInitialDataState | null>;
  }>({ promise: null! });
  if (!initialStatePromiseRef.current.promise) {
    initialStatePromiseRef.current.promise =
      resolvablePromise<ExcalidrawInitialDataState | null>();
  }

  const debugCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    trackEvent("load", "frame", getFrame());
    setTimeout(() => {
      trackEvent("load", "version", getVersion());
    }, VERSION_TIMEOUT);
  }, []);

  useHandleLibrary({
    excalidrawAPI,
    adapter: CombinedLibraryAdapter,
    onLibraryUrlImport: ({ libraryUrl, addedItemIds }) => {
      autoCreateGroupFromUrlImport(libraryUrl, addedItemIds);
      window.dispatchEvent(
        new CustomEvent("excalidraw-library-imported", {
          detail: { addedItemIds },
        }),
      );
    },
  });

  useEffect(() => {
    if (!excalidrawAPI) return;
    const unmountGroup = mountLibraryGroupEnhancer(excalidrawAPI);
    const unmountAI = mountLibraryAIActions();
    return () => {
      unmountGroup();
      unmountAI();
    };
  }, [excalidrawAPI]);

  const [, hashBump] = useState(0);
  useEffect(() => {
    const onHash = () => hashBump((n) => n + 1);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    setCombinedLibraryFileId(getFileIdFromHash());
  }, [hashBump, excalidrawAPI]);

  useEffect(() => {
    const onSaved = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; hash?: string }>).detail;
      if (detail?.id && typeof detail.hash === "string") {
        FileSyncState.setBaselineHash(detail.id, detail.hash);
        FileSyncState.setDraftHash(detail.id, detail.hash);
        window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
      }
    };
    window.addEventListener("excalidraw-server-saved", onSaved);
    return () => window.removeEventListener("excalidraw-server-saved", onSaved);
  }, []);

  useEffect(() => {
    if (!forkSaveHint) {
      return;
    }
    const t = window.setTimeout(() => setForkSaveHint(null), 4500);
    return () => window.clearTimeout(t);
  }, [forkSaveHint]);

  const [, forceRefresh] = useState(false);

  useEffect(() => {
    if (isDevEnv()) {
      const debugState = loadSavedDebugState();

      if (debugState.enabled && !window.visualDebug) {
        window.visualDebug = {
          data: [],
        };
      } else {
        delete window.visualDebug;
      }
      forceRefresh((prev) => !prev);
    }
  }, [excalidrawAPI]);

  // ---------------------------------------------------------------------------
  // Hoisted loadImages
  // ---------------------------------------------------------------------------
  const loadImages = useCallback(
    (data: ResolutionType<typeof initializeScene>, isInitialLoad = false) => {
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

  const getSceneData = useCallback(() => {
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

  const localPersistGenRef = useRef(0);

  const updateDraftHashDebouncedRef = useRef(
    debounce(
      (fileId: string, getScene: () => ReturnType<typeof getSceneData>) => {
        if (getFileIdFromHash() !== fileId) {
          return;
        }
        const sceneData = getScene();
        if (!sceneData || !fileId) {
          return;
        }
        const h = hashSceneSnapshot(sceneData);
        FileSyncState.setDraftHash(fileId, h);
        window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));

        const baseline = FileSyncState.getBaselineHash(fileId);
        if (!baseline || h === baseline) {
          localPersistGenRef.current += 1;
          return;
        }

        FileSyncState.setLocalEditTime(fileId);

        const myGen = ++localPersistGenRef.current;
        void (async () => {
          try {
            const deltas = await DeltaStorage.getAllPersistedDtos();
            if (myGen !== localPersistGenRef.current) {
              return;
            }
            const latest = getScene();
            if (!latest || !fileId) {
              return;
            }
            const h2 = hashSceneSnapshot(latest);
            const b2 = FileSyncState.getBaselineHash(fileId);
            if (!b2 || h2 === b2) {
              return;
            }
            FileSyncState.setLocalCache(fileId, {
              elements: latest.elements,
              appState: latest.appState,
              files: latest.files,
              deltas,
            });
          } catch {
            // quota / idb
          }
        })();
      },
      450,
    ),
  );

  useEffect(() => {
    const debounced = updateDraftHashDebouncedRef.current;
    return () => {
      debounced.cancel();
    };
  }, []);

  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }

    initializeScene({ excalidrawAPI }).then(async (data) => {
      loadImages(data, /* isInitialLoad */ true);
      initialStatePromiseRef.current.promise.resolve(data.scene);
      await restorePersistedUndoStack(excalidrawAPI);
      revealForkCanvasAfterFit(excalidrawAPI, () => setForkCanvasRevealed(true), { skipFit: data.hasBrowserViewport });
      setTimeout(async () => {
        const fid = getFileIdFromHash();
        if (!fid) {
          return;
        }
        const scene = getSceneData();
        if (!scene) {
          return;
        }
        const h = hashSceneSnapshot(scene);
        const b = FileSyncState.getBaselineHash(fid);
        const d = FileSyncState.getDraftHash(fid);
        if (!b || (b === d)) {
          FileSyncState.setBaselineHash(fid, h);
          FileSyncState.setDraftHash(fid, h);
          const existing = FileSyncState.getLocalCache(fid);
          FileSyncState.setLocalCache(fid, {
            elements: scene.elements,
            appState: scene.appState,
            files: scene.files,
            deltas: existing?.deltas ?? [],
          });
          debugLog.hash(`normalize file=${fid.slice(0, 8)}, hash=${h.slice(0, 8)}`);
        }
      }, 100);
    });

    const onHashChange = async (event: HashChangeEvent) => {
      const oldFileId = getFileIdFromUrl(event.oldURL);
      const newFileId = getFileIdFromUrl(event.newURL);

      event.preventDefault();
      const libraryUrlTokens = parseLibraryTokensFromUrl();
      if (!libraryUrlTokens) {
        excalidrawAPI.updateScene({ appState: { isLoading: true } });
        setForkCanvasRevealed(false);

        initializeScene({ excalidrawAPI }).then(async (data) => {
          loadImages(data, !!newFileId);
          if (data.scene) {
            const appState = restoreAppState(sanitizePersistedAppState(data.scene.appState as any) as any, null);
            excalidrawAPI.updateScene({
              elements: restoreElements(data.scene.elements, null, {
                repairBindings: true,
                deleteInvisibleElements: true,
              }),
              appState: { ...appState, isLoading: false },
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
          revealForkCanvasAfterFit(excalidrawAPI, () =>
            setForkCanvasRevealed(true),
            { skipFit: data.hasBrowserViewport },
          );
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
                const h = hashSceneSnapshot(scene);
                FileSyncState.setBaselineHash(fid, h);
                FileSyncState.setDraftHash(fid, h);
              }
            }
          }, 100);
        });
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
      visibilityFlushTimer = window.setTimeout(() => {
        visibilityFlushTimer = null;
        if (document.hidden) {
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
    setForkCanvasRevealed,
  ]);

  useEffect(() => {
    const unloadHandler = (event: BeforeUnloadEvent) => {
      FileEditDirty.prepareForDirtyEvaluation({
        flushEmbeddedLocalFiles: () => LocalData.flushSave(),
        draftFlusher: updateDraftHashDebouncedRef.current,
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
  }, [excalidrawAPI, getSceneData]);

  const reloadSceneFromServer = useCallback(async () => {
    const fid = getFileIdFromHash();
    if (!fid || !excalidrawAPI) {
      return;
    }
    localPersistGenRef.current += 1;
    const serverFile = await ServerSync.getFile(fid);
    const serverData = serverFile.data as ForkSceneSnapshot;
    if (!serverData || typeof serverData !== "object") {
      return;
    }
    const mergedAppState = {
      ...(serverData.appState ?? {}),
      name: serverFile.name ?? (serverData.appState as any)?.name ?? "",
    };
    const h = hashSceneSnapshot(serverData);
    FileSyncState.setBaselineHash(fid, h);
    FileSyncState.setDraftHash(fid, h);
    await DeltaStorage.restoreSnapshot([]);
    setForkCanvasRevealed(false);
    const restoredAppState = restoreAppState(sanitizePersistedAppState(mergedAppState as any) as any, null);
    // Preserve current sidebar state so that a restore does not close
    // the sidebar or the history panel unexpectedly.
    const currentAppState = excalidrawAPI.getAppState();
    (restoredAppState as any).openSidebar = currentAppState.openSidebar;
    excalidrawAPI.updateScene({
      elements: restoreElements(serverData.elements as any, null, {
        repairBindings: true,
        deleteInvisibleElements: true,
      }),
      appState: restoredAppState,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    const files = (serverData.files || {}) as BinaryFiles;
    if (files && Object.keys(files).length) {
      excalidrawAPI.addFiles(Object.values(files));
    }
    FileSyncState.setLocalCache(fid, {
      elements: serverData.elements,
      appState: mergedAppState,
      files: serverData.files,
      deltas: [],
    });
    revealForkCanvasAfterFit(excalidrawAPI, () => setForkCanvasRevealed(true));
    window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
  }, [excalidrawAPI, setForkCanvasRevealed]);

  const navigateToFileListHome = useCallback(() => {
    skipLeaveStashOnceRef.current = true;
    if (window.location.hash.startsWith("#file=")) {
      window.location.hash = "";
    }
    window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
  }, []);

  /** 放弃未保存编辑（与服务器基线对齐），再回列表；编排见 discardLocalEditsNavigateHome。 */
  const discardLocalEditsForHomeNavigation = useCallback(async () => {
    await discardLocalEditsNavigateHome({
      getFileId: () => getFileIdFromHash(),
      flushDraftDebounce: () => updateDraftHashDebouncedRef.current.flush(),
      bumpPersistGeneration: () => {
        localPersistGenRef.current += 1;
      },
      navigateToFileListHome,
    });
  }, [navigateToFileListHome]);

  const persistLocalDraftToCache = useCallback(async (forcedFileId?: string): Promise<boolean> => {
    const fid = forcedFileId ?? getFileIdFromHash();
    updateDraftHashDebouncedRef.current.flush();
    localPersistGenRef.current += 1;
    if (!fid) {
      debugLog.stash("persistLocalDraft skip: no file id");
      return false;
    }
    if (!excalidrawAPI) {
      debugLog.stash(`persistLocalDraft skip ${fid.slice(0, 8)}: no api`);
      return false;
    }
    const hasUnsaved = FileSyncState.hasUnsavedChanges(fid);
    debugLog.stash(`persistLocalDraft enter ${fid.slice(0, 8)} unsaved=${hasUnsaved}`);
    if (!hasUnsaved) {
      debugLog.stash(`persistLocalDraft skip ${fid.slice(0, 8)}: no unsaved changes`);
      return false;
    }
    const sceneData = getSceneData();
    if (!sceneData) {
      debugLog.stash(`persistLocalDraft skip ${fid.slice(0, 8)}: no sceneData`);
      return false;
    }
    const deltas = await DeltaStorage.getAllPersistedDtos();
    FileSyncState.setLocalCache(fid, {
      elements: sceneData.elements,
      appState: sceneData.appState,
      files: sceneData.files,
      deltas,
    });
    const localAfterWrite = FileSyncState.getLocalCache(fid);
    const localAfterWriteElements = Array.isArray(localAfterWrite?.elements)
      ? localAfterWrite.elements.length
      : 0;
    const dh = hashSceneSnapshot(sceneData);
    FileSyncState.setDraftHash(fid, dh);
    debugLog.save(
      `persistLocalDraft file=${fid.slice(0, 8)}, draftHash=${dh.slice(0, 8)}, elements=${sceneData.elements.length}, localCacheElements=${localAfterWriteElements}`,
    );
    try {
      const thumbnail = await buildSceneThumbnailSvg({
        elements: sceneData.elements,
        appState: sceneData.appState,
        files: sceneData.files,
      });
      LocalThumbnailCache.set(fid, thumbnail);
      const thumbAfterWrite = LocalThumbnailCache.get(fid);
      debugLog.thumbnail(
        `persistLocalDraft file=${fid.slice(0, 8)}, svgLen=${thumbnail.length}, cacheHit=${!!thumbAfterWrite}, cacheLen=${thumbAfterWrite?.length ?? 0}`,
      );
    } catch (err) {
      debugLog.thumbnail(`persistLocalDraft file=${fid.slice(0, 8)}, exportToSvg FAILED`, err);
    }
    return true;
  }, [excalidrawAPI, getSceneData]);

  const finishNavigateHome = useCallback(() => {
    window.setTimeout(() => {
      skipLeaveStashOnceRef.current = true;
      navigateToFileListHome();
    }, 80);
  }, [navigateToFileListHome]);

  const saveCurrentFileToServer = useCallback(
    async (opts?: SaveToServerOptions): Promise<boolean> => {
      const source: SaveToServerSource = opts?.source ?? "toolbar";
      const navigateAfter = opts?.navigateAfter ?? false;
      const fid = getFileIdFromHash();
      if (!excalidrawAPI || !fid) {
        if (navigateAfter) {
          finishNavigateHome();
        }
        return false;
      }
      updateDraftHashDebouncedRef.current.flush();
      localPersistGenRef.current += 1;
      const sceneData = getSceneData();
      if (!sceneData) {
        if (navigateAfter) {
          finishNavigateHome();
        }
        return false;
      }
      const h = hashSceneSnapshot(sceneData);
      const baseline = FileSyncState.getBaselineHash(fid);
      if (baseline && h === baseline) {
        if (source === "toolbar" || source === "hotkey") {
          setForkSaveHint("内容与最新提交一致，无需保存");
        }
        if (navigateAfter) {
          FileSyncState.clearLocalCache(fid);
          finishNavigateHome();
        }
        return false;
      }
      if (source !== "visibility") {
        setForkSaving(true);
      } else {
        visibilitySaveInFlightRef.current = true;
      }
      if (source === "toolbar" || source === "home" || source === "hotkey") {
        setForkSaveHint(null);
      }
      try {
        const nameForPut = await resolveSaveDisplayName(fid, sceneData.appState);
        let thumbnail: string | undefined;
        try {
          thumbnail = await buildSceneThumbnailSvg({
            elements: sceneData.elements,
            appState: sceneData.appState,
            files: sceneData.files,
          });
          LocalThumbnailCache.set(fid, thumbnail);
          debugLog.thumbnail(`saveToServer file=${fid.slice(0, 8)}, svgLen=${thumbnail.length}`);
        } catch (err) {
          debugLog.thumbnail(`saveToServer file=${fid.slice(0, 8)}, exportToSvg FAILED`, err);
        }
        debugLog.save(
          `saveToServer file=${fid.slice(0, 8)}, name=${nameForPut}, hasThumb=${!!thumbnail}, elements=${sceneData.elements.length}, source=${source}`,
        );
        const result = await ServerSync.saveFileImmediate(
          fid,
          sceneData,
          nameForPut,
          thumbnail,
          { suppressSavedEvent: true },
        );
        debugLog.save(`saveToServer file=${fid.slice(0, 8)}, result`, result);
        const deltasAfterSave = await DeltaStorage.getAllPersistedDtos();
        FileSyncState.setLocalCache(fid, {
          elements: sceneData.elements,
          appState: sceneData.appState,
          files: sceneData.files,
          deltas: deltasAfterSave,
        });

        if (result?.content_sha256) {
          FileSyncState.setServerHash(fid, result.content_sha256);
        }
        updateDraftHashDebouncedRef.current.cancel();
        localPersistGenRef.current += 1;
        const hAfter = hashSceneSnapshot(getSceneData() ?? sceneData);
        FileSyncState.setBaselineHash(fid, hAfter);
        FileSyncState.setDraftHash(fid, hAfter);
        FileSyncState.clearLocalEditTime(fid);
        debugLog.hash(
          `saveToServer done file=${fid.slice(0, 8)}, baseline=draft=${hAfter.slice(0, 8)}, serverSha=${result?.content_sha256?.slice(0, 8) ?? "none"}`,
        );

        window.dispatchEvent(
          new CustomEvent("excalidraw-server-saved", {
            detail: { id: fid, hash: hAfter },
          }),
        );
        window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
        window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
        if (result?.skipped) {
          if (source === "toolbar" || source === "hotkey") {
            setForkSaveHint("已是最新版本");
          }
        } else if (source === "visibility") {
          excalidrawAPI.setToast({ message: "切换到后台时已保存到服务器" });
        } else if (source === "hotkey" || source === "toolbar") {
          excalidrawAPI.setToast({ message: "已保存" });
        } else if (source === "home") {
          /* 主页：不单独提示成功，直接返回 */
        }
        if (navigateAfter) {
          FileSyncState.clearLocalCache(fid);
          finishNavigateHome();
        }
        return true;
      } catch (e: any) {
        console.error("[saveCurrentFileToServer]", e);
        if (source === "visibility") {
          /* visibility 静默失败，只打控制台 */
        } else {
          setErrorMessage(e?.message ?? String(e));
        }
        if (navigateAfter) {
          const okLocal = await persistLocalDraftToCache();
          if (okLocal) {
            window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
            window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
            excalidrawAPI.setToast({ message: "无法上传到服务器，已暂存到本机并返回" });
          }
          finishNavigateHome();
        }
        return false;
      } finally {
        if (source !== "visibility") {
          setForkSaving(false);
        } else {
          visibilitySaveInFlightRef.current = false;
        }
      }
    },
    [excalidrawAPI, getSceneData, finishNavigateHome, persistLocalDraftToCache],
  );

  useEffect(() => {
    saveToServerRef.current = saveCurrentFileToServer;
  }, [saveCurrentFileToServer]);

  const forkGoHomeWithServerSave = useCallback(async () => {
    const fid = getFileIdFromHash();
    if (!excalidrawAPI || !fid) {
      navigateToFileListHome();
      return;
    }
    FileEditDirty.prepareForDirtyEvaluation({
      flushEmbeddedLocalFiles: () => LocalData.flushSave(),
      draftFlusher: updateDraftHashDebouncedRef.current,
    });
    if (!FileEditDirty.hasUnsavedChanges(fid)) {
      navigateToFileListHome();
      return;
    }
    setForkHomeNavDialogOpen(true);
  }, [excalidrawAPI, navigateToFileListHome]);

  const forkHomeConfirmSave = useCallback(async () => {
    setForkHomeNavDialogOpen(false);
    await saveCurrentFileToServer({ source: "home", navigateAfter: true });
  }, [saveCurrentFileToServer]);

  const forkHomeConfirmDiscard = useCallback(async () => {
    setForkHomeNavDialogOpen(false);
    await discardLocalEditsForHomeNavigation();
  }, [discardLocalEditsForHomeNavigation]);

  const forkHomeDismissDialog = useCallback(() => {
    setForkHomeNavDialogOpen(false);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== "s") {
        return;
      }
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e as KeyboardEvent & { isComposing?: boolean }).isComposing
      ) {
        return;
      }
      if (!getFileIdFromHash()) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      void saveToServerRef.current?.({ source: "hotkey" });
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const onChange = (
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    if (!LocalData.isSavePaused()) {
      LocalData.save(elements, appState, files, () => {
        if (excalidrawAPI) {
          let didChange = false;

          const elements = excalidrawAPI
            .getSceneElementsIncludingDeleted()
            .map((element) => {
              if (
                LocalData.fileStorage.shouldUpdateImageElementStatus(element)
              ) {
                const newElement = newElementWith(element, { status: "saved" });
                if (newElement !== element) {
                  didChange = true;
                }
                return newElement;
              }
              return element;
            });

          if (didChange) {
            excalidrawAPI.updateScene({
              elements,
              captureUpdate: CaptureUpdateAction.NEVER,
            });
          }
        }
      }, getFileIdFromHash());
    }

    const fid = getFileIdFromHash();
    if (fid && excalidrawAPI) {
      updateDraftHashDebouncedRef.current(fid, getSceneData);
    }

    if (debugCanvasRef.current && excalidrawAPI) {
      debugRenderer(
        debugCanvasRef.current,
        appState,
        elements,
        window.devicePixelRatio,
      );
    }
  };

  const onIncrement = useCallback((increment: any) => {
    if (StoreIncrement.isDurable(increment) && increment.delta) {
      void DeltaStorage.recordStoreDelta(increment.delta as StoreDelta);
    }
  }, []);

  const renderCustomStats = (
    elements: readonly NonDeletedExcalidrawElement[],
    appState: UIAppState,
  ) => {
    return (
      <CustomStats
        setToast={(message) => excalidrawAPI!.setToast({ message })}
        appState={appState}
        elements={elements}
      />
    );
  };

  const localStorageQuotaExceeded = useAtomValue(localStorageQuotaExceededAtom);

  const onExport: Required<ExcalidrawProps>["onExport"] = useCallback(
    async function* () {
      let snapshot = FileStatusStore.getSnapshot();
      const { pending, total } = FileStatusStore.getPendingCount(
        snapshot.value,
      );
      if (pending === 0) {
        return;
      }

      yield {
        type: "progress",
        progress: (total - pending) / total,
        message: `Loading images (${total - pending}/${total})...`,
      };

      while (true) {
        snapshot = await FileStatusStore.pull(snapshot.version);
        const { pending: nowPending, total: nowTotal } =
          FileStatusStore.getPendingCount(snapshot.value);

        yield {
          type: "progress",
          progress: (nowTotal - nowPending) / nowTotal,
          message: `Loading images (${nowTotal - nowPending}/${nowTotal})...`,
        };

        if (nowPending === 0) {
          await new Promise((r) => setTimeout(r, 500));
          yield {
            type: "progress",
            message: `Preparing export...`,
          };
          return;
        }
      }
    },
    [],
  );

  if (isSelfEmbedding) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          height: "100%",
        }}
      >
        <h1>I'm not a pretzel!</h1>
      </div>
    );
  }

  useEffect(() => {
    if (!forkFileId) {
      return;
    }
    const onHashLeave = (event: HashChangeEvent) => {
      const nextFileId = getFileIdFromHashString(new URL(event.newURL).hash);
      if (nextFileId === forkFileId) {
        return;
      }
      if (skipLeaveStashOnceRef.current) {
        skipLeaveStashOnceRef.current = false;
        debugLog.stash(`hashLeave skip ${forkFileId.slice(0, 8)}: already handled`);
        return;
      }
      debugLog.stash(
        `hashLeave auto-stash ${forkFileId.slice(0, 8)} -> ${nextFileId?.slice(0, 8) ?? "home"}`,
      );
      void persistLocalDraftToCache(forkFileId);
    };
    window.addEventListener("hashchange", onHashLeave);
    return () => {
      window.removeEventListener("hashchange", onHashLeave);
    };
  }, [forkFileId, persistLocalDraftToCache]);

  const renderForkTopRightUI = useCallback(
    (isMobile: boolean) => {
      if (!forkFileId) {
        return null;
      }
      return (
        <div
          className={
            isMobile
              ? "excal-fork-toolbar-stack excal-fork-toolbar-stack--phone excalidraw-ui-top-right"
              : "excal-fork-toolbar-stack excalidraw-ui-top-right"
          }
        >
          <div
            className="excal-fork-toolbar-wrap"
            role="toolbar"
            aria-label="文件与保存"
          >
            <button
              type="button"
              className="excal-action-btn excal-btn-save"
              disabled={forkSaving}
              title="保存到服务器（Ctrl+S / ⌘S）"
              aria-label="保存到服务器"
              onClick={() => void saveCurrentFileToServer({ source: "toolbar" })}
            >
              {toolbarSaveIcon}
              <span>{forkSaving ? "保存中…" : "保存"}</span>
            </button>
            <button
              type="button"
              className="excal-action-btn excal-btn-stash excal-btn-home"
              disabled={forkSaving}
              title="返回文件列表（有未保存修改时将询问）"
              onClick={() => void forkGoHomeWithServerSave()}
            >
              {smallHouseIcon}
              <span>主页</span>
            </button>
          </div>
          {forkSaveHint ? (
            <div className="excal-fork-save-hint" role="status">
              {forkSaveHint}
            </div>
          ) : null}
        </div>
      );
    },
    [forkFileId, forkSaving, forkSaveHint, saveCurrentFileToServer, forkGoHomeWithServerSave],
  );

  const hideForkCanvasUntilFit = !!forkFileId && !forkCanvasRevealed;

  return (
    <div
      style={{ height: "100%" }}
      className={`excalidraw-app${
        editorTheme === THEME.DARK ? " theme--dark" : ""
      }`}
    >
      <div
        style={{
          height: "100%",
          opacity: hideForkCanvasUntilFit ? 0 : 1,
          pointerEvents: hideForkCanvasUntilFit ? "none" : "auto",
        }}
      >
      <Excalidraw
        onChange={onChange}
        onIncrement={onIncrement}
        onExport={onExport}
        onLibraryChange={syncLibraryItems}
        initialData={initialStatePromiseRef.current.promise}
        isCollaborating={false}
        UIOptions={{
          canvasActions: {
            toggleTheme: true,
          },
        }}
        langCode={langCode}
        renderCustomStats={renderCustomStats}
        detectScroll={false}
        handleKeyboardGlobally={true}
        autoFocus={true}
        theme={editorTheme}
        renderTopRightUI={renderForkTopRightUI}
        onLinkOpen={(element, event) => {
          if (element.link && isElementLink(element.link)) {
            event.preventDefault();
            excalidrawAPI?.scrollToContent(element.link, { animate: true });
          }
        }}
      >
        <AppMainMenu
          theme={appTheme}
          setTheme={(theme) => setAppTheme(theme)}
          refresh={() => forceRefresh((prev) => !prev)}
          onGoHome={() => void forkGoHomeWithServerSave()}
          onSaveToServer={
            forkFileId
              ? () => void saveCurrentFileToServer({ source: "toolbar" })
              : undefined
          }
          saveToServerPending={forkSaving}
          onToggleHistory={() => setShowHistoryPanel((v) => !v)}
        />
        <AppWelcomeScreen />
        <OverwriteConfirmDialog>
          <OverwriteConfirmDialog.Actions.ExportToImage />
          <OverwriteConfirmDialog.Actions.SaveToDisk />
        </OverwriteConfirmDialog>
        <AppFooter onChange={() => excalidrawAPI?.refresh()} />
        {excalidrawAPI && <AIComponents excalidrawAPI={excalidrawAPI} />}

        <TTDDialogTrigger />
        {localStorageQuotaExceeded && (
          <div className="alert alert--danger">
            {t("alerts.localStorageQuotaExceeded")}
          </div>
        )}
        <AppSidebar />

        {errorMessage && (
          <ErrorDialog onClose={() => setErrorMessage("")}>
            {errorMessage}
          </ErrorDialog>
        )}

        <CommandPalette
          customCommandPaletteItems={[
            {
              label: "主页",
              category: DEFAULT_CATEGORIES.app,
              keywords: ["home", "list", "files", "主页", "返回"],
              predicate: () => !!getFileIdFromHash(),
              perform: () => {
                void forkGoHomeWithServerSave();
              },
            },
            {
              label: "历史版本",
              category: DEFAULT_CATEGORIES.app,
              keywords: ["history", "version", "archive", "历史", "版本"],
              predicate: () => !!getFileIdFromHash(),
              perform: () => {
                setShowHistoryPanel((v) => !v);
              },
            },
            {
              ...CommandPalette.defaultItems.toggleTheme,
              perform: () => {
                setAppTheme(
                  editorTheme === THEME.DARK ? THEME.LIGHT : THEME.DARK,
                );
              },
            },
            {
              label: t("labels.installPWA"),
              category: DEFAULT_CATEGORIES.app,
              predicate: () => !!pwaEvent,
              perform: () => {
                if (pwaEvent) {
                  pwaEvent.prompt();
                  pwaEvent.userChoice.then(() => {
                    pwaEvent = null;
                  });
                }
              },
            },
          ]}
        />
        {isVisualDebuggerEnabled() && excalidrawAPI && (
          <DebugCanvas
            appState={excalidrawAPI.getAppState()}
            scale={window.devicePixelRatio}
            ref={debugCanvasRef}
          />
        )}
        {forkFileId && showHistoryPanel && (
          <ArchivePanel
            fileId={forkFileId}
            onAfterRestore={async () => {
              await reloadSceneFromServer();
            }}
            onClose={() => setShowHistoryPanel(false)}
          />
        )}
      </Excalidraw>
      </div>
      {forkHomeNavDialogOpen && forkFileId ? (
        <div
          className="fork-home-dialog-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              forkHomeDismissDialog();
            }
          }}
        >
          <div
            className="fork-home-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fork-home-nav-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="fork-home-nav-title">返回文件列表</h3>
            <p className="fork-home-dialog-desc">
              当前画布有未保存的修改，是否先保存？
            </p>
            <div className="fork-home-dialog-actions">
              <button
                type="button"
                className="fork-home-btn fork-home-btn--primary"
                disabled={forkSaving}
                onClick={() => void forkHomeConfirmSave()}
              >
                保存并返回
              </button>
              <button
                type="button"
                className="fork-home-btn fork-home-btn--danger"
                disabled={forkSaving}
                onClick={() => void forkHomeConfirmDiscard()}
              >
                不保存，放弃修改并返回
              </button>
            </div>
            <button
              type="button"
              className="fork-home-dialog-cancel"
              disabled={forkSaving}
              onClick={forkHomeDismissDialog}
            >
              取消，继续编辑
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Default export — the lazy-loadable shell
// ---------------------------------------------------------------------------

const EditorShell = () => (
  <ExcalidrawAPIProvider>
    <ExcalidrawWrapper />
  </ExcalidrawAPIProvider>
);

export default EditorShell;
