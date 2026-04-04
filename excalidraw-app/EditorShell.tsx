import {
  Excalidraw,
  exportToSvg,
  TTDDialogTrigger,
  CaptureUpdateAction,
  ExcalidrawAPIProvider,
  useExcalidrawAPI,
} from "@excalidraw/excalidraw";
import { trackEvent } from "@excalidraw/excalidraw/analytics";
import { cleanAppStateForExport } from "@excalidraw/excalidraw/appState";
import {
  CommandPalette,
  DEFAULT_CATEGORIES,
} from "@excalidraw/excalidraw/components/CommandPalette/CommandPalette";
import { ErrorDialog } from "@excalidraw/excalidraw/components/ErrorDialog";
import { OverwriteConfirmDialog } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirm";
import { historyIcon } from "@excalidraw/excalidraw/components/icons";
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
import clsx from "clsx";
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
import { FileSyncState } from "./data/FileSyncState";
import { scrollEditorToFitContent } from "./data/scrollEditorToFit";
import {
  FILE_LIST_THUMB_EXPORT_PADDING,
  appStateForThumbnailExport,
} from "./data/thumbnailExport";
import type { ForkSceneSnapshot } from "./data/forkFileTypes";
import { resolveSaveDisplayName } from "./data/forkFileNaming";
import { LocalThumbnailCache } from "./data/localThumbnailCache";
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
}> => {
  const fileIdFromHash = getFileIdFromHash();
  if (fileIdFromHash) {
    await DeltaStorage.setFileId(fileIdFromHash);
    const localRecord = FileSyncState.getLocalCache(fileIdFromHash);
    const localElements = Array.isArray((localRecord as any)?.elements)
      ? ((localRecord as any).elements as unknown[])
      : [];
    const localHasContent = localElements.length > 0;

    let serverNewerThanLocal = false;
    try {
      const hashes = await ServerSync.listFileHashes();
      const entry = hashes.find((h) => h.id === fileIdFromHash);
      if (entry?.content_sha256) {
        serverNewerThanLocal = FileSyncState.isServerChanged(
          fileIdFromHash,
          entry.content_sha256,
        );
      }
    } catch {
      // offline / error → use local if available
    }

    if (localHasContent && !serverNewerThanLocal) {
      const data = localRecord!;
      const draftH = hashSceneSnapshot({
        elements: data.elements,
        appState: data.appState,
        files: data.files,
      });
      if (!FileSyncState.getBaselineHash(fileIdFromHash)) {
        FileSyncState.setBaselineHash(fileIdFromHash, draftH);
      }
      FileSyncState.setDraftHash(fileIdFromHash, draftH);
      await DeltaStorage.restoreSnapshot(data.deltas);
      return {
        scene: {
          elements: restoreElements(data.elements as any, null, {
            repairBindings: true,
            deleteInvisibleElements: true,
          }),
          appState: restoreAppState(sanitizePersistedAppState(data.appState as any) as any, null),
          files: (data.files || {}) as any,
          scrollToContent: true,
        },
        isExternalScene: false,
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
    } catch {
      // fall through
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
      await DeltaStorage.restoreSnapshot(data.deltas);
      return {
        scene: {
          elements: restoreElements(data.elements as any, null, {
            repairBindings: true,
            deleteInvisibleElements: true,
          }),
          appState: restoreAppState(sanitizePersistedAppState(data.appState as any) as any, null),
          files: (data.files || {}) as any,
          scrollToContent: true,
        },
        isExternalScene: false,
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
      await DeltaStorage.restoreSnapshot([]);
      return {
        scene: {
          elements: restoreElements(data.elements as any, null, {
            repairBindings: true,
            deleteInvisibleElements: true,
          }),
          appState: restoreAppState(sanitizePersistedAppState(mergedAppState as any) as any, null),
          files: (data.files || {}) as any,
          scrollToContent: true,
        },
        isExternalScene: false,
      };
    }

    return {
      scene: {
        elements: [],
        appState: {},
        scrollToContent: true,
      },
      isExternalScene: false,
    };
  }

  return {
    scene: {
      elements: [],
      appState: {},
      scrollToContent: true,
    },
    isExternalScene: false,
  };
};

// ---------------------------------------------------------------------------
// ExcalidrawWrapper — the full editor component
// ---------------------------------------------------------------------------

const ExcalidrawWrapper = () => {
  const excalidrawAPI = useExcalidrawAPI();

  const [errorMessage, setErrorMessage] = useState("");
  const [forkSaving, setForkSaving] = useState(false);
  const [forkSaveHint, setForkSaveHint] = useState<string | null>(null);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);

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
      setTimeout(() => scrollEditorToFitContent(excalidrawAPI), 50);
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

    const onHashChange = async (event: HashChangeEvent) => {
      const oldFileId = getFileIdFromUrl(event.oldURL);
      const newFileId = getFileIdFromUrl(event.newURL);
      if (oldFileId && oldFileId !== newFileId && excalidrawAPI) {
        updateDraftHashDebouncedRef.current.cancel();
        localPersistGenRef.current += 1;
        if (FileSyncState.hasUnsavedChanges(oldFileId)) {
          const sceneData = getSceneData();
          if (sceneData) {
            const deltas = await DeltaStorage.getAllPersistedDtos();
            FileSyncState.setLocalCache(oldFileId, {
              elements: sceneData.elements,
              appState: sceneData.appState,
              files: sceneData.files,
              deltas,
            });
          }
        }
      }

      event.preventDefault();
      const libraryUrlTokens = parseLibraryTokensFromUrl();
      if (!libraryUrlTokens) {
        excalidrawAPI.updateScene({ appState: { isLoading: true } });

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
          queueMicrotask(() => scrollEditorToFitContent(excalidrawAPI));
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
          LocalData.flushSave();
        }
      }, 400);
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
  }, [excalidrawAPI, loadImages, getSceneData, restorePersistedUndoStack]);

  useEffect(() => {
    const unloadHandler = (event: BeforeUnloadEvent) => {
      LocalData.flushSave();

      const fid = getFileIdFromHash();
      let didEmergencyLocalCache = false;
      if (fid && excalidrawAPI && FileSyncState.hasUnsavedChanges(fid)) {
        updateDraftHashDebouncedRef.current.flush();
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
    queueMicrotask(() => scrollEditorToFitContent(excalidrawAPI));
    window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
  }, [excalidrawAPI]);

  const navigateToFileListHome = useCallback(() => {
    if (window.location.hash.startsWith("#file=")) {
      window.location.hash = "";
    }
    window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
  }, []);

  const persistLocalDraftToCache = useCallback(async (): Promise<boolean> => {
    const fid = getFileIdFromHash();
    updateDraftHashDebouncedRef.current.flush();
    localPersistGenRef.current += 1;
    if (!fid || !excalidrawAPI || !FileSyncState.hasUnsavedChanges(fid)) {
      return false;
    }
    const sceneData = getSceneData();
    if (!sceneData) {
      return false;
    }
    const deltas = await DeltaStorage.getAllPersistedDtos();
    FileSyncState.setLocalCache(fid, {
      elements: sceneData.elements,
      appState: sceneData.appState,
      files: sceneData.files,
      deltas,
    });
    FileSyncState.setDraftHash(fid, hashSceneSnapshot(sceneData));
    try {
      const svg = await exportToSvg({
        elements: sceneData.elements,
        appState: appStateForThumbnailExport(
          sceneData.appState as AppState,
        ),
        files: sceneData.files,
        exportPadding: FILE_LIST_THUMB_EXPORT_PADDING,
      });
      LocalThumbnailCache.set(fid, svg.outerHTML);
    } catch {
      // thumbnail optional
    }
    return true;
  }, [excalidrawAPI, getSceneData]);

  const forkStashLocalAndGoHome = useCallback(async () => {
    const ok = await persistLocalDraftToCache();
    if (ok) {
      window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
      window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
      excalidrawAPI?.setToast({ message: "已暂存并返回" });
    }
    navigateToFileListHome();
  }, [persistLocalDraftToCache, navigateToFileListHome, excalidrawAPI]);

  const saveCurrentFileToServer = useCallback(async (): Promise<boolean> => {
    const fid = getFileIdFromHash();
    if (!excalidrawAPI || !fid) {
      return false;
    }
    updateDraftHashDebouncedRef.current.flush();
    localPersistGenRef.current += 1;
    const sceneData = getSceneData();
    if (!sceneData) {
      return false;
    }
    const h = hashSceneSnapshot(sceneData);
    const baseline = FileSyncState.getBaselineHash(fid);
    if (baseline && h === baseline) {
      setForkSaveHint("内容与最新提交一致，无需上传");
      return false;
    }
    setForkSaving(true);
    setForkSaveHint(null);
    try {
      const nameForPut = await resolveSaveDisplayName(fid, sceneData.appState);
      let thumbnail: string | undefined;
      try {
        const svg = await exportToSvg({
          elements: sceneData.elements,
          appState: appStateForThumbnailExport(
            sceneData.appState as AppState,
          ),
          files: sceneData.files,
          exportPadding: FILE_LIST_THUMB_EXPORT_PADDING,
        });
        thumbnail = svg.outerHTML;
        LocalThumbnailCache.set(fid, thumbnail);
      } catch {
        // thumbnail optional
      }
      const result = await ServerSync.saveFileImmediate(
        fid,
        sceneData,
        nameForPut,
        thumbnail,
        { suppressSavedEvent: true },
      );
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

      window.dispatchEvent(
        new CustomEvent("excalidraw-server-saved", {
          detail: { id: fid, hash: hAfter },
        }),
      );
      window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
      window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
      if (result?.skipped) {
        setForkSaveHint("已是最新版本");
      } else {
        excalidrawAPI.setToast({ message: "已上传至服务器" });
      }
      return true;
    } catch (e: any) {
      console.error("[saveCurrentFileToServer]", e);
      setErrorMessage(e?.message ?? String(e));
      return false;
    } finally {
      setForkSaving(false);
    }
  }, [excalidrawAPI, getSceneData]);

  const handleForkSaveAndExit = useCallback(async () => {
    const ok = await saveCurrentFileToServer();
    if (ok) {
      updateDraftHashDebouncedRef.current.flush();
      const fid = getFileIdFromHash();
      if (fid) {
        const latest = getSceneData();
        if (latest) {
          const h = hashSceneSnapshot(latest);
          FileSyncState.setBaselineHash(fid, h);
          FileSyncState.setDraftHash(fid, h);
        }
        FileSyncState.clearLocalCache(fid);
      }
      window.setTimeout(() => navigateToFileListHome(), 400);
    }
  }, [saveCurrentFileToServer, navigateToFileListHome, getSceneData]);

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
      });
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

  const forkFileId = getFileIdFromHash();

  const renderForkTopRightUI = useCallback(
    (isMobile: boolean) => {
      if (!forkFileId || isMobile) {
        return null;
      }
      return (
        <div className="excal-fork-toolbar-stack excalidraw-ui-top-right">
          <div
            className="excal-fork-toolbar-wrap"
            role="toolbar"
            aria-label="文件与保存"
          >
            <button
              type="button"
              className="excal-action-btn excal-btn-stash excal-btn-home"
              title="暂存到本机并返回文件列表"
              onClick={() => void forkStashLocalAndGoHome()}
            >
              {smallHouseIcon}
              <span>主页</span>
            </button>
            <button
              type="button"
              className="excal-action-btn excal-btn-save"
              disabled={forkSaving}
              title="先将当前画布上传到服务器，成功后再返回文件列表"
              aria-label="上传画布到服务器后返回文件列表"
              onClick={() => void handleForkSaveAndExit()}
            >
              {toolbarSaveIcon}
              <span>
                {forkSaving ? "上传中…" : "上传并退出"}
              </span>
            </button>
            <button
              type="button"
              className={clsx(
                "excal-action-btn excal-btn-history",
                showHistoryPanel && "excal-btn-history--active",
              )}
              title="历史版本"
              aria-label="历史版本"
              aria-pressed={showHistoryPanel}
              onClick={() => setShowHistoryPanel((v) => !v)}
            >
              {historyIcon}
              <span>历史版本</span>
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
    [
      forkFileId,
      forkSaving,
      forkSaveHint,
      showHistoryPanel,
      forkStashLocalAndGoHome,
      handleForkSaveAndExit,
    ],
  );

  return (
    <div
      style={{ height: "100%" }}
      className={`excalidraw-app${
        editorTheme === THEME.DARK ? " theme--dark" : ""
      }`}
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
                void forkStashLocalAndGoHome();
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
