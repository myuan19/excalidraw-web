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
import { fileOpen } from "@excalidraw/excalidraw/data/filesystem";

import type {
  NonDeletedExcalidrawElement,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";
import type {
  AppState,
  ExcalidrawImperativeAPI,
  BinaryFiles,
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
import {
  applyAppShellPendingNavigation,
  type AppShellNavigateDetail,
} from "../../shell/appShellNavigate";
import {
  EDITOR_HOST_COMMAND_EVENT,
  getEditorHostCommandDetail,
} from "../../shell/editorHostCommand";
import { APP_SHELL_GO_HOME } from "../../shell/Sidebar";
import { buildViewHash } from "../../shell/useAppView";
import { EmbedTokenManager } from "../../components/EmbedTokenManager";
import { ArchivePanel } from "../../components/ArchivePanel";
import { LocalDraftLossConfirmDialog } from "../../components/LocalDraftLossConfirmDialog";
import { SaveNewDocumentDialog } from "../../components/PromoteTempFileDialog";
import { useLocalDraftLossConfirm } from "../../hooks/useLocalDraftLossConfirm";
import { useSaveNewDocumentDialog } from "../../hooks/useSaveNewDocumentDialog";
import { bootstrapLocalDraftSession } from "../../data/bootstrapLocalDraftSession";
import { isLegacyTempFileId, isNewDocumentHash } from "../../data/documentHash";
import { isLocalDraftFileId } from "../../data/localDraftFileId";
import { getDocumentKindFromHash } from "../../lib/appBranding";
import { editorRegistry } from "../../editors";
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
import { notifyEdit } from "../../data/autoSaveSession";
import { DEFAULT_DOCUMENT_DISPLAY_NAME } from "../../data/defaultDocumentName";
import { useRemoteFileRefresh } from "../../hooks/useRemoteFileRefresh";
import { clearTabFileDirty } from "../../data/tabFileDirtyState";
import { RemoteUpdateConfirmDialog } from "../../components/RemoteUpdateConfirmDialog";
import { requestSave } from "../../data/saveQueue";
import { hashSceneSnapshot } from "../../data/sceneHash";
import {
  formatImportErrorMessage,
  loadExcalidrawFileAsServerSceneData,
} from "../../data/importExcalidrawScene";
import { restoreSceneAppState, restoreSceneElements } from "../../data/sceneRestore";
import { ServerSync } from "../../data/ServerSync";
import type { ForkSceneSnapshot } from "../../data/forkFileTypes";
import { revealForkCanvasAfterFit } from "../../data/scrollEditorToFit";
import {
  getFileIdFromHash,
  getFileIdFromHashString,
} from "../../data/fileIdFromHash";
import { useEditorDocumentTitle } from "../../lib/appBranding";
import {
  logEditorOpenPhase,
  resetEditorOpenPhaseLog,
  type EditorOpenPhase,
} from "../../lib/editorOpenPhases";

import { useBeforeUnloadGuard } from "../../hooks/useBeforeUnloadGuard";
import { useForkFileSave } from "./useForkFileSave";
import { useSceneInitialization } from "../../hooks/useSceneInitialization";

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

// ---------------------------------------------------------------------------
// ExcalidrawWrapper — the full editor component
// ---------------------------------------------------------------------------

const ExcalidrawWrapper = () => {
  const excalidrawAPI = useExcalidrawAPI();
  const forkFileId = getFileIdFromHash();
  const onOpenPhase = useCallback(
    (phase: EditorOpenPhase) => {
      logEditorOpenPhase(phase, {
        editor: "excalidraw",
        fileId8: forkFileId?.slice(0, 8) ?? null,
      });
    },
    [forkFileId],
  );

  const [tabFileName, setTabFileName] = useState<string | null>(null);

  useEditorDocumentTitle(forkFileId ? tabFileName : null);

  useEffect(() => {
    setTabFileName(null);
  }, [forkFileId]);

  useEffect(() => {
    if (!forkFileId || !excalidrawAPI) {
      return;
    }
    const name = excalidrawAPI.getAppState().name?.trim();
    if (name) {
      setTabFileName(name);
    }
  }, [forkFileId, excalidrawAPI]);

  useEffect(() => {
    if (forkFileId && isLegacyTempFileId(forkFileId)) {
      window.location.hash = buildViewHash("home");
    }
  }, [forkFileId]);

  useEffect(() => {
    if (forkFileId || !isNewDocumentHash()) {
      return;
    }
    const kind = getDocumentKindFromHash();
    void bootstrapLocalDraftSession(kind).then(({ id }) => {
      window.location.hash = editorRegistry.buildFileHash(id, kind);
    });
  }, [forkFileId]);

  useEffect(() => {
    resetEditorOpenPhaseLog();
    if (forkFileId) {
      logEditorOpenPhase("resolving", {
        editor: "excalidraw",
        fileId8: forkFileId.slice(0, 8),
      });
    }
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

  const fileSaveRef = useRef<{
    persistLocalDraftToCache: () => Promise<boolean>;
    flushDraftDebounce: () => void;
  } | null>(null);

  const localDraftLoss = useLocalDraftLossConfirm({
    getFileId: getFileIdFromHash,
  });

  const saveNewDoc = useSaveNewDocumentDialog({
    getFileId: getFileIdFromHash,
    getDocumentKind: getDocumentKindFromHash,
    getDefaultName: () =>
      excalidrawAPI?.getAppState().name?.trim() || "未命名",
    getExcalidrawScene: () => getSceneDataRef.current(),
    beforeSave: async () => {
      fileSaveRef.current?.flushDraftDebounce();
    },
    navigateHome: navigateToFileListHome,
    setErrorMessage,
  });

  const {
    forkSaving,
    forkSaveHint,
    forkHomeNavDialogOpen,
    saveCurrentFileToServer,
    persistLocalDraftToCache,
    forkGoHomeWithServerSave,
    confirmBeforeRestoreArchive,
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
    onRequestSaveNew: ({ navigateAfter }) => {
      saveNewDoc.openSaveDialog(navigateAfter);
    },
  });

  fileSaveRef.current = {
    persistLocalDraftToCache,
    flushDraftDebounce: () => updateDraftHashDebouncedRef.current.flush(),
  };

  // Wire up navigation to set the skip flag
  useEffect(() => {
    navigateToFileListHomeRef.current = () => {
      skipLeaveStashOnceRef.current = true;
      window.location.hash = buildViewHash("home");
      window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
    };
  }, [skipLeaveStashOnceRef]);

  const importLocalExcalidrawFile = useCallback(async () => {
    if (!excalidrawAPI) {
      return;
    }
    try {
      const file = await fileOpen({
        description: "Excalidraw files",
        extensions: ["excalidraw", "json", "png", "svg"],
      });
      const scene = await loadExcalidrawFileAsServerSceneData(file);
      const files = Object.values(scene.files ?? {});
      if (files.length > 0) {
        excalidrawAPI.addFiles(files);
      }
      excalidrawAPI.updateScene({
        elements: scene.elements as OrderedExcalidrawElement[],
        appState: {
          ...((scene.appState ?? {}) as Partial<AppState>),
          isLoading: false,
        } as AppState,
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      excalidrawAPI.setToast({ message: "导入成功" });
    } catch (err: any) {
      if (err?.name === "AbortError") {
        return;
      }
      excalidrawAPI.setToast({ message: formatImportErrorMessage(err) });
    }
  }, [excalidrawAPI]);

  useEffect(() => {
    const onSave = (requestId?: string) =>
      requestSave({ source: "sidebar", requestId });
    const onExport = () => {
      excalidrawAPI?.setOpenDialog({ name: "imageExport" });
    };
    const onImport = () => void importLocalExcalidrawFile();
    const onHistory = () => {
      if (!forkFileId) {
        return;
      }
      setShowHistoryPanel(true);
    };
    const onEmbed = () => {
      if (!forkFileId || isLocalDraftFileId(forkFileId)) {
        return;
      }
      setShowEmbedManager(true);
    };
    const onShellGoHome = (event: Event) => {
      const detail = (event as CustomEvent<AppShellNavigateDetail>).detail;
      applyAppShellPendingNavigation(
        detail,
        skipLeaveStashOnceRef,
        (fn) => {
          navigateToFileListHomeRef.current = fn;
        },
      );
      void forkGoHomeWithServerSave();
    };
    const onHostCommand = (event: Event) => {
      const detail = getEditorHostCommandDetail(event);
      if (!detail) {
        return;
      }
      switch (detail.command) {
        case "save":
          onSave(detail.requestId);
          break;
        case "export":
          onExport();
          break;
        case "import":
          onImport();
          break;
        case "history":
          onHistory();
          break;
        case "embed":
          onEmbed();
          break;
      }
    };
    const onLegacySave = () => onSave();
    window.addEventListener(EDITOR_HOST_COMMAND_EVENT, onHostCommand);
    window.addEventListener("excalidraw-host-request-save", onLegacySave);
    window.addEventListener("excalidraw-host-open-export", onExport);
    window.addEventListener("excalidraw-host-open-import", onImport);
    window.addEventListener("excalidraw-host-open-history", onHistory);
    window.addEventListener("excalidraw-host-open-embed", onEmbed);
    window.addEventListener(APP_SHELL_GO_HOME, onShellGoHome);
    return () => {
      window.removeEventListener(EDITOR_HOST_COMMAND_EVENT, onHostCommand);
      window.removeEventListener("excalidraw-host-request-save", onLegacySave);
      window.removeEventListener("excalidraw-host-open-export", onExport);
      window.removeEventListener("excalidraw-host-open-import", onImport);
      window.removeEventListener("excalidraw-host-open-history", onHistory);
      window.removeEventListener("excalidraw-host-open-embed", onEmbed);
      window.removeEventListener(APP_SHELL_GO_HOME, onShellGoHome);
    };
  }, [
    excalidrawAPI,
    forkFileId,
    forkGoHomeWithServerSave,
    importLocalExcalidrawFile,
    saveCurrentFileToServer,
    skipLeaveStashOnceRef,
  ]);

  // ---------------------------------------------------------------------------
  // Scene initialization hook
  // ---------------------------------------------------------------------------

  const { initialDataPromise, getSceneData } = useSceneInitialization({
    excalidrawAPI,
    onOpenPhase,
    updateDraftHashDebouncedRef,
    localPersistGenRef,
    saveToServerRef,
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
    const serverFile = await ServerSync.getFile(fid, { force: true });
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
    clearTabFileDirty(fid);
    if (serverFile.content_sha256) {
      FileSyncState.setServerHash(fid, serverFile.content_sha256);
    }
    await DeltaStorage.restoreSnapshot([]);
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
    revealForkCanvasAfterFit(excalidrawAPI, () => {});
    window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
    window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
  }, [excalidrawAPI, localPersistGenRef]);

  const notifyRemoteReloaded = useCallback(() => {
    excalidrawAPI?.setToast({ message: "已同步远端更新" });
  }, [excalidrawAPI]);
  const remoteRefresh = useRemoteFileRefresh({
    fileId: excalidrawAPI ? forkFileId : null,
    reload: reloadSceneFromServer,
    onReloaded: notifyRemoteReloaded,
  });

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
      notifyEdit();
    }

    if (forkFileId) {
      const name = appState.name?.trim();
      if (name) {
        setTabFileName((prev) => (prev === name ? prev : name));
      }
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

  return (
    <div
      style={{ height: "100%" }}
      className={`excalidraw-app${
        editorTheme === THEME.DARK ? " theme--dark" : ""
      }`}
    >
      <div style={{ height: "100%" }}>
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
            onBeforeRestore={confirmBeforeRestoreArchive}
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
              {saveNewDoc.isLocalDraftOpen()
                ? "这是尚未保存的临时文档，离开前是否先保存到服务器？不保存将丢失本机草稿。"
                : "当前画布有未保存的修改，是否先保存？"}
            </p>
            <div className="fork-home-dialog-actions">
              <button
                type="button"
                className="fork-home-btn fork-home-btn--primary"
                disabled={forkSaving}
                onClick={() => {
                  if (saveNewDoc.isLocalDraftOpen()) {
                    forkHomeDismissDialog();
                    saveNewDoc.openSaveDialog(true);
                    return;
                  }
                  void forkHomeConfirmSave();
                }}
              >
                保存并返回
              </button>
              <button
                type="button"
                className="fork-home-btn fork-home-btn--danger"
                disabled={forkSaving}
                onClick={() => {
                  if (saveNewDoc.isLocalDraftOpen()) {
                    forkHomeDismissDialog();
                    localDraftLoss.requestConfirm(() => {
                      skipLeaveStashOnceRef.current = true;
                      navigateToFileListHome();
                    });
                    return;
                  }
                  void forkHomeConfirmDiscard();
                }}
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
      <LocalDraftLossConfirmDialog
        open={localDraftLoss.open}
        documentName={localDraftLoss.documentName}
        busy={forkSaving}
        onConfirm={() => void localDraftLoss.confirmLoss()}
        onCancel={localDraftLoss.dismiss}
      />
      <RemoteUpdateConfirmDialog
        open={remoteRefresh.promptOpen}
        documentName={tabFileName || DEFAULT_DOCUMENT_DISPLAY_NAME}
        onReload={remoteRefresh.confirmReload}
        onKeep={remoteRefresh.dismissPrompt}
      />
      <SaveNewDocumentDialog
        open={saveNewDoc.saveOpen}
        saving={saveNewDoc.saveInFlight}
        overlayDismiss={saveNewDoc.saveOverlayDismiss}
        defaultName={saveNewDoc.defaultSaveName()}
        presetFolderId={saveNewDoc.presetFolderId()}
        onClose={saveNewDoc.dismissSave}
        onSave={saveNewDoc.commitSave}
      />
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
