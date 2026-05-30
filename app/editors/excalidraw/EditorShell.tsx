import {
  Excalidraw,
  TTDDialogTrigger,
  CaptureUpdateAction,
  ExcalidrawAPIProvider,
  useExcalidrawAPI,
} from "@excalidraw/excalidraw";
import { trackEvent } from "@excalidraw/excalidraw/analytics";
import { createLogger } from "../../lib/logger";
import {
  CommandPalette,
  DEFAULT_CATEGORIES,
} from "@excalidraw/excalidraw/components/CommandPalette/CommandPalette";
import { ErrorDialog } from "@excalidraw/excalidraw/components/ErrorDialog";
import { OverwriteConfirmDialog } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirm";
import {
  THEME,
  VERSION_TIMEOUT,
  getVersion,
  getFrame,
  isDevEnv,
} from "@excalidraw/common";
import polyfill from "@excalidraw/excalidraw/polyfill";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@excalidraw/excalidraw/i18n";
import { isElementLink } from "@excalidraw/element";
import { newElementWith, StoreIncrement, type StoreDelta } from "@excalidraw/element";
import {
  useHandleLibrary,
} from "@excalidraw/excalidraw/data/library";

import type {
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

import CustomStats from "../../CustomStats";
import { useAtomValue } from "../../app-jotai";
import { AppFooter } from "../../components/AppFooter";
import { AppMainMenu } from "../../components/AppMainMenu";
import { AppWelcomeScreen } from "../../components/AppWelcomeScreen";

import { FileStatusStore } from "../../data/fileStatusStore";
import { LocalData, localStorageQuotaExceededAtom } from "../../data/LocalData";
import { useHandleAppTheme } from "../../useHandleAppTheme";
import { useAppLangCode } from "../../app-language/language-state";
import DebugCanvas, {
  debugRenderer,
  isVisualDebuggerEnabled,
  loadSavedDebugState,
} from "../../components/DebugCanvas";
import { AIComponents } from "../../components/AI";

import { AppSidebar } from "../../components/AppSidebar";
import { APP_SHELL_GO_HOME } from "../../shell/Sidebar";
import { buildViewHash, type AppView } from "../../shell/useAppView";
import { EmbedTokenManager } from "../../components/EmbedTokenManager";
import { ArchivePanel } from "../../components/ArchivePanel";
import "../../components/ExcalToolbar.scss";
import "../../components/ForkLibrarySidebar.scss";
import {
  mountLibraryGroupEnhancer,
  syncLibraryItems,
  autoCreateGroupFromUrlImport,
} from "../../components/LibraryGroupEnhancer";
import {
  CombinedLibraryAdapter,
  setCombinedLibraryFileId,
} from "../../data/CombinedLibraryAdapter";
import { mountLibraryAIActions } from "../../data/libraryAIMount";
import { DeltaStorage } from "../../data/DeltaStorage";
import { FileSyncState } from "../../data/FileSyncState";
import { hashSceneSnapshot } from "../../data/sceneHash";
import { restoreSceneAppState, restoreSceneElements } from "../../data/sceneRestore";
import { ServerSync } from "../../data/ServerSync";
import type { ForkSceneSnapshot } from "../../data/forkFileTypes";
import { readForkBrowserAppStateOverlay } from "../../data/forkBrowserSceneStorage";
import { revealForkCanvasAfterFit } from "../../data/scrollEditorToFit";
import {
  getFileIdFromHash,
  getFileIdFromHashString,
} from "../../data/fileIdFromHash";

import { useBeforeUnloadGuard } from "../../hooks/useBeforeUnloadGuard";
import { useForkFileSave } from "./useForkFileSave";
import { useSceneInitialization } from "../../hooks/useSceneInitialization";

const logInit = createLogger({ module: "init" });
const logStash = createLogger({ module: "stash" });
const logShell = createLogger({ module: "EditorShell" });

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

type InitSceneResult = {
  scene: ExcalidrawInitialDataState | null;
  isExternalScene: false;
  hasBrowserViewport: boolean;
};

const EMPTY_INIT_RESULT: InitSceneResult = {
  scene: { elements: [], appState: {}, scrollToContent: true },
  isExternalScene: false,
  hasBrowserViewport: false,
};

function buildInitResult(
  data: ForkSceneSnapshot,
  overlay: Partial<AppState> | null,
): InitSceneResult {
  return {
    scene: {
      elements: restoreSceneElements(data.elements),
      appState: restoreSceneAppState(data.appState, overlay),
      files: (data.files || {}) as any,
      ...(overlay ? {} : { scrollToContent: true }),
    },
    isExternalScene: false,
    hasBrowserViewport: !!overlay,
  };
}

const initializeScene = async (opts: {
  excalidrawAPI: ExcalidrawImperativeAPI;
}): Promise<InitSceneResult> => {
  const fileIdFromHash = getFileIdFromHash();
  if (!fileIdFromHash) {
    return EMPTY_INIT_RESULT;
  }

  const fid8 = fileIdFromHash.slice(0, 8);
  logInit.debug(`initializeScene file=${fid8}`);
  await DeltaStorage.setFileId(fileIdFromHash);
  const localRecord = FileSyncState.getLocalCache(fileIdFromHash);
  const localElements = Array.isArray((localRecord as any)?.elements)
    ? ((localRecord as any).elements as unknown[])
    : [];
  const localHasContent = localElements.length > 0;
  logInit.debug(`file=${fid8} localHasContent=${localHasContent}, localElements=${localElements.length}`);

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
      logInit.debug(`file=${fid8} serverSha=${entry.content_sha256.slice(0, 8)}, serverNewer=${serverNewerThanLocal}`);
    } else {
      logInit.debug(`file=${fid8} no server sha256 found`);
    }
  } catch {
    logInit.debug(`file=${fid8} hash fetch failed (offline?)`);
  }

  // Priority 1: local cache is fresh (server not newer)
  if (localHasContent && !serverNewerThanLocal) {
    const data = localRecord!;
    const draftH = hashSceneSnapshot(data);
    const existingBaseline = FileSyncState.getBaselineHash(fileIdFromHash);
    if (!existingBaseline) {
      FileSyncState.setBaselineHash(fileIdFromHash, draftH);
    }
    FileSyncState.setDraftHash(fileIdFromHash, draftH);
    logInit.debug(`file=${fid8} → use LOCAL cache, hash=${draftH.slice(0, 8)}, existingBaseline=${existingBaseline?.slice(0, 8) ?? "none"}`);
    await DeltaStorage.restoreSnapshot(data.deltas);
    return buildInitResult(data, forkBrowserOverlay);
  }

  // Try fetching from server (serverNewerThanLocal or no local content)
  let serverData: ForkSceneSnapshot | null = null;
  let serverRecord: Awaited<ReturnType<typeof ServerSync.getFile>> | null = null;
  try {
    serverRecord = await ServerSync.getFile(fileIdFromHash);
    if (serverRecord.data && typeof serverRecord.data === "object") {
      serverData = serverRecord.data as ForkSceneSnapshot;
    }
    logInit.debug(`file=${fid8} server fetch ok, hasData=${!!serverData}, elements=${Array.isArray(serverData?.elements) ? serverData.elements.length : 0}`);
  } catch (err) {
    logInit.debug(`file=${fid8} server fetch failed`, err);
  }

  // Priority 2: local cache fallback (server said newer but fetch failed)
  if (localHasContent && !serverData) {
    const data = localRecord!;
    const draftH = hashSceneSnapshot(data);
    FileSyncState.alignHashes(fileIdFromHash, draftH);
    logInit.debug(`file=${fid8} → use LOCAL (no server data), hash=${draftH.slice(0, 8)}`);
    await DeltaStorage.restoreSnapshot(data.deltas);
    return buildInitResult(data, forkBrowserOverlay);
  }

  // Priority 3: server data available
  if (serverData) {
    const mergedAppState = {
      ...(serverData.appState ?? {}),
      name: serverRecord?.name ?? (serverData.appState as any)?.name ?? "",
    };
    const h = hashSceneSnapshot(serverData);
    FileSyncState.alignHashes(fileIdFromHash, h);
    if (serverRecord?.content_sha256) {
      FileSyncState.setServerHash(fileIdFromHash, serverRecord.content_sha256);
    }
    FileSyncState.setLocalCache(fileIdFromHash, {
      elements: serverData.elements,
      appState: mergedAppState,
      files: serverData.files,
      deltas: [],
    });
    logInit.debug(`file=${fid8} → use SERVER data, hash=${h.slice(0, 8)}, baseline=draft=${h.slice(0, 8)}`);
    await DeltaStorage.restoreSnapshot([]);
    return buildInitResult({ ...serverData, appState: mergedAppState }, forkBrowserOverlay);
  }

  logInit.debug(`file=${fid8} → EMPTY scene (no local, no server)`);
  return EMPTY_INIT_RESULT;
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
    document.title = "excalidraw";
  }, []);

  useEffect(() => {
    setForkCanvasRevealed(!forkFileId);
  }, [forkFileId]);

  const [errorMessage, setErrorMessage] = useState("");
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showEmbedManager, setShowEmbedManager] = useState(false);

  const { editorTheme, appTheme, setAppTheme } = useHandleAppTheme();
  const [langCode] = useAppLangCode();
  const debugCanvasRef = useRef<HTMLCanvasElement>(null);
  const [, forceRefresh] = useState(false);

  // ---------------------------------------------------------------------------
  // File save hook
  // ---------------------------------------------------------------------------

  const getSceneDataRef = useRef<() => { elements: any; appState: any; files: any } | null>(() => null);

  const navigateToFileListHomeRef = useRef(() => {});
  const navigateToFileListHome = useCallback(() => {
    navigateToFileListHomeRef.current();
  }, []);

  const {
    forkSaving,
    forkSaveHint,
    forkHomeNavDialogOpen,
    saveCurrentFileToServer,
    persistLocalDraftToCache,
    forkGoHomeWithServerSave,
    forkHomeConfirmSave,
    forkHomeConfirmDiscard,
    forkHomeDismissDialog,
    saveToServerRef,
    visibilitySaveInFlightRef,
    localPersistGenRef,
    updateDraftHashDebouncedRef,
    skipLeaveStashOnceRef,
  } = useForkFileSave({
    excalidrawAPI,
    getSceneDataRef,
    navigateToFileListHome,
    setErrorMessage,
  });

  // Wire up navigation to set the skip flag
  useEffect(() => {
    navigateToFileListHomeRef.current = () => {
      skipLeaveStashOnceRef.current = true;
      window.location.hash = buildViewHash("home");
      window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
    };
  }, [skipLeaveStashOnceRef]);

  useEffect(() => {
    const onSave = () => void saveCurrentFileToServer({ source: "sidebar" });
    const onHistory = () => setShowHistoryPanel(true);
    const onEmbed = () => setShowEmbedManager(true);
    const onShellGoHome = (event: Event) => {
      const target = ((event as CustomEvent<{ target?: string }>).detail
        ?.target ?? "home") as Exclude<AppView, "editor">;
      navigateToFileListHomeRef.current = () => {
        skipLeaveStashOnceRef.current = true;
        window.location.hash = buildViewHash(target);
        window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
      };
      void forkGoHomeWithServerSave();
    };
    window.addEventListener("excalidraw-host-request-save", onSave);
    window.addEventListener("excalidraw-host-open-history", onHistory);
    window.addEventListener("excalidraw-host-open-embed", onEmbed);
    window.addEventListener("mindmap-host-request-save", onSave);
    window.addEventListener("mindmap-host-open-history", onHistory);
    window.addEventListener("mindmap-host-open-embed", onEmbed);
    window.addEventListener(APP_SHELL_GO_HOME, onShellGoHome);
    return () => {
      window.removeEventListener("excalidraw-host-request-save", onSave);
      window.removeEventListener("excalidraw-host-open-history", onHistory);
      window.removeEventListener("excalidraw-host-open-embed", onEmbed);
      window.removeEventListener("mindmap-host-request-save", onSave);
      window.removeEventListener("mindmap-host-open-history", onHistory);
      window.removeEventListener("mindmap-host-open-embed", onEmbed);
      window.removeEventListener(APP_SHELL_GO_HOME, onShellGoHome);
    };
  }, [
    forkGoHomeWithServerSave,
    saveCurrentFileToServer,
    skipLeaveStashOnceRef,
  ]);

  // ---------------------------------------------------------------------------
  // Scene initialization hook
  // ---------------------------------------------------------------------------

  const { initialDataPromise, getSceneData } = useSceneInitialization({
    excalidrawAPI,
    initializeScene,
    updateDraftHashDebouncedRef,
    localPersistGenRef,
    saveToServerRef,
    visibilitySaveInFlightRef,
    setForkCanvasRevealed,
  });

  // Bridge: keep save hook's getSceneData in sync
  useEffect(() => {
    getSceneDataRef.current = getSceneData;
    logShell.info("hooks wired — getSceneData bridge connected");
  }, [getSceneData]);

  // ---------------------------------------------------------------------------
  // Before-unload guard & keyboard shortcuts
  // ---------------------------------------------------------------------------

  useBeforeUnloadGuard({
    excalidrawAPI,
    getSceneData,
    updateDraftHashDebounced: updateDraftHashDebouncedRef.current,
  });

  // Ctrl+S is handled by EditorPlatformSidebar (same as the ball save button).

  // ---------------------------------------------------------------------------
  // Misc lifecycle effects
  // ---------------------------------------------------------------------------

  useEffect(() => {
    logShell.info("ExcalidrawWrapper mounted", { forkFileId: forkFileId?.slice(0, 8) ?? "none" });
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
        FileSyncState.alignHashes(detail.id, detail.hash);
      }
    };
    window.addEventListener("excalidraw-server-saved", onSaved);
    return () => window.removeEventListener("excalidraw-server-saved", onSaved);
  }, []);

  useEffect(() => {
    if (isDevEnv()) {
      const debugState = loadSavedDebugState();
      if (debugState.enabled && !window.visualDebug) {
        window.visualDebug = { data: [] };
      } else {
        delete window.visualDebug;
      }
      forceRefresh((prev) => !prev);
    }
  }, [excalidrawAPI]);

  // ---------------------------------------------------------------------------
  // Reload from server (used by ArchivePanel)
  // ---------------------------------------------------------------------------

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
    FileSyncState.alignHashes(fid, h);
    await DeltaStorage.restoreSnapshot([]);
    setForkCanvasRevealed(false);
    const restoredAppState = restoreSceneAppState(mergedAppState);
    const currentAppState = excalidrawAPI.getAppState();
    (restoredAppState as any).openSidebar = currentAppState.openSidebar;
    excalidrawAPI.updateScene({
      elements: restoreSceneElements(serverData.elements),
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
  }, [excalidrawAPI, setForkCanvasRevealed, localPersistGenRef]);

  // ---------------------------------------------------------------------------
  // onChange / onIncrement handlers
  // ---------------------------------------------------------------------------

  const onChange = (
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    if (!document.hidden) {
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
      logShell.debug("durable delta recorded", { deltaId: (increment.delta as StoreDelta).id?.slice(0, 8) });
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
        logStash.debug(`hashLeave skip ${forkFileId.slice(0, 8)}: already handled`);
        return;
      }
      logStash.debug(
        `hashLeave auto-stash ${forkFileId.slice(0, 8)} -> ${nextFileId?.slice(0, 8) ?? "home"}`,
      );
      void persistLocalDraftToCache(forkFileId);
    };
    window.addEventListener("hashchange", onHashLeave);
    return () => {
      window.removeEventListener("hashchange", onHashLeave);
    };
  }, [forkFileId, persistLocalDraftToCache]);

  const renderForkTopRightUI = useCallback(() => null, []);

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
        initialData={initialDataPromise}
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
      {forkFileId && (
        <EmbedTokenManager
          fileId={forkFileId}
          fileName={
            excalidrawAPI?.getAppState().name || "未命名"
          }
          open={showEmbedManager}
          onClose={() => setShowEmbedManager(false)}
        />
      )}
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
            <h3 id="fork-home-nav-title">主页</h3>
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
