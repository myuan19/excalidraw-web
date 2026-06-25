import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { EditorShellCacheProps } from "../editorShellCacheProps";

import {
  Excalidraw,
  ExcalidrawAPIProvider,
  MainMenu,
  THEME,
  CaptureUpdateAction,
} from "@excalidraw/excalidraw";

import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

import { fileOpen } from "@excalidraw/excalidraw/data/filesystem";
import { cleanAppStateForExport } from "@excalidraw/excalidraw/appState";

import {
  generateExcalidrawThumbnailAndCache,
  scheduleExcalidrawThumbnailAndCache,
} from "../../data/excalidrawThumbnail";
import { getAppSettings } from "../../data/appSettings";
import {
  registerEditorTabDiscardHandler,
  registerEditorTabSaveHandler,
} from "../../data/activeEditorSaveBridge";
import { registerEditorTabSnapshotHandler } from "../../data/activeEditorSnapshotBridge";
import { discardCommittedFileEditsForLeave } from "../../data/fileEditSession";
import { discardLocalDraftSession } from "../../data/discardLocalDraftSession";
import {
  cacheExcalidrawDraft,
  markDocumentCommitted,
} from "../../data/documentDraftService";
import { canonicalizeExcalidrawSceneFileName } from "../../data/excalidrawFileNameAuthority";
import { CHECKPOINT_LABELS } from "../../data/checkpointPolicy";
import { DEFAULT_DOCUMENT_DISPLAY_NAME } from "../../data/defaultDocumentName";
import {
  applyFileModificationState,
  evaluateCurrentFileModificationState,
  readStoredFileModificationState,
} from "../../data/fileModificationState";
import { markEditSessionEdited } from "../../data/editSessionService";
import { notifyLocalDraftEdited } from "../../data/localDraftSessions";
import { FileSyncState } from "../../data/FileSyncState";
import { getFileIdFromHash } from "../../data/fileIdFromHash";
import { ExcalidrawAdapter } from "../../data/formats/ExcalidrawAdapter";
import { isLocalDraftFileId } from "../../data/localDraftFileId";
import { LocalThumbnailCache } from "../../data/localThumbnailCache";
import { loadEditorServerFile } from "../../data/loadEditorServerFile";
import { removeRecentFileEntry } from "../../data/recentFiles";
import {
  formatImportErrorMessage,
  loadExcalidrawFileAsServerSceneData,
} from "../../data/importExcalidrawScene";
import { saveNewDocument } from "../../data/saveNewDocument";
import {
  getLocalDraftPresetFolderIdForFile,
  localDraftNeedsSaveFolderPicker,
  shouldSkipLocalDraftFormalSave,
  shouldUseNativeSaveDialogForDraft,
} from "../../data/localDraftSaveFolder";
import {
  isRemoteApplyInProgress,
  isRemoteUpdateTargetSatisfied,
  type RemoteUpdateTarget,
} from "../../data/fileSyncOperationState";
import {
  restoreSceneAppState,
  restoreSceneElements,
} from "../../data/sceneRestore";
import {
  isServerSyncNotFoundError,
  ServerSync,
  type ServerFile,
} from "../../data/ServerSync";
import { hashSceneSnapshot } from "../../data/sceneHash";
import { useEditorDocumentTitle } from "../../lib/appBranding";
import { devDebug } from "../../lib/devDebug";
import { isDesktopEditorHub } from "../../lib/runtimePlatform";
import { markEditSessionOpened } from "../../data/editSessionService";
import { createSerializedSaveRunner } from "../../data/serializedSave";
import { updateLocalCacheServerVersionMeta } from "../../data/documentSessionVersionSync";
import { finalizeSavedThumbnail } from "../../data/thumbnailLifecycle";
import { useRemoteFileRefresh } from "../../hooks/useRemoteFileRefresh";
import { useSaveNewDocumentDialog } from "../../hooks/useSaveNewDocumentDialog";
import { resolveEditorSaveConflict } from "../../shell/editorSaveConflict";
import {
  activateHomeTabWithoutSnapshot,
  openEditorFileTab,
  removeMissingEditorFileTab,
  replaceOpenFileTabAfterSave,
} from "../../shell/editorTabNavigation";
import {
  EDITOR_HOST_COMMAND_EVENT,
  getEditorHostCommandDetail,
} from "../../shell/editorHostCommand";

import { AppWelcomeScreen } from "../../components/AppWelcomeScreen";
import { ArchivePanel } from "../../components/ArchivePanel";
import { EmbedTokenManager } from "../../components/EmbedTokenManager";
import "../../components/ExcalToolbar.scss";
import { SaveNewDocumentDialog } from "../../components/PromoteTempFileDialog";

import { applyRemoteExcalidrawScene } from "./applyRemoteExcalidrawScene";
import { useForkFileSave } from "./useForkFileSave";

import type { ActiveEditorSaveSource } from "../../data/activeEditorSaveBridge";
import type { ExcalidrawThumbnailScene } from "../../data/excalidrawThumbnail";
import type { ForkSceneSnapshot } from "../../data/forkFileTypes";

type ActiveExcalidrawScene = ForkSceneSnapshot &
  ExcalidrawThumbnailScene & {
    version?: number;
  };

function getSceneVersion(scene: ForkSceneSnapshot): number {
  return typeof (scene as { version?: unknown }).version === "number"
    ? (scene as { version: number }).version ?? 2
    : 2;
}

function toActiveExcalidrawScene(
  scene: ForkSceneSnapshot,
): ActiveExcalidrawScene {
  return {
    ...scene,
    elements: scene.elements ?? [],
    appState: scene.appState ?? {},
    files: scene.files ?? {},
    version: getSceneVersion(scene),
  };
}

function normalizeExcalidrawData(
  raw: unknown,
  name?: string,
): ActiveExcalidrawScene {
  try {
    return toActiveExcalidrawScene(ExcalidrawAdapter.parse(raw));
  } catch {
    return toActiveExcalidrawScene(ExcalidrawAdapter.createEmpty(name));
  }
}

export default function ExcalidrawEditorShell({
  pinnedFileId,
  isEditorTabActive = true,
}: EditorShellCacheProps = {}) {
  const [file, setFile] = useState<ServerFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showEmbedManager, setShowEmbedManager] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileId = pinnedFileId ?? getFileIdFromHash();
  const saveFile = useForkFileSave(fileId);
  const localDraftTimerRef = useRef<number | null>(null);
  const autoSaveTimerRef = useRef<number | null>(null);
  const latestDocumentRef = useRef<unknown | null>(null);
  const latestSceneRef = useRef<ActiveExcalidrawScene | null>(null);
  const pendingSnapshotSceneRef = useRef<ActiveExcalidrawScene | null>(null);
  const latestHashRef = useRef<string | null>(null);
  const latestThumbnailRef = useRef<string | null>(null);
  const enqueueSaveRef = useRef(createSerializedSaveRunner<boolean>());
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const {
    saveOpen,
    saveInFlight,
    saveOverlayDismiss,
    dismissSave,
    openSaveDialog,
    commitSave,
    presetFolderId,
    defaultSaveName,
    allowOpenLocalFolder,
    openLocalFolderBusy,
    openLocalFolderForSave,
  } = useSaveNewDocumentDialog({
    getFileId: () => fileId,
    getDocumentKind: () => "excalidraw",
    getDefaultName: () => file?.name ?? DEFAULT_DOCUMENT_DISPLAY_NAME,
    getExcalidrawScene: () => latestSceneRef.current,
    navigateHome: () => {
      activateHomeTabWithoutSnapshot();
    },
    setErrorMessage: setError,
  });

  useEditorDocumentTitle(file?.name);

  useEffect(() => {
    if (fileId) {
      markEditSessionOpened(fileId);
    }
  }, [fileId]);

  const handleMissingServerFile = useCallback((missingFileId: string) => {
    FileSyncState.clearLocalCache(missingFileId);
    FileSyncState.clearHashStateForFile(missingFileId);
    FileSyncState.clearLocalEditTime(missingFileId);
    LocalThumbnailCache.clear(missingFileId);
    removeRecentFileEntry(missingFileId);
    removeMissingEditorFileTab(missingFileId);
    setFile(null);
    setError("文件不存在或已被删除");
    window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
    window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!fileId) {
      setFile(null);
      return;
    }
    devDebug("editor-open", "load file | start", {
      fileId8: fileId.slice(0, 20),
    });
    const preferLocalRecovery = FileSyncState.hasUnsavedChanges(fileId);
    loadEditorServerFile(fileId, { force: !preferLocalRecovery })
      .then((next) => {
        if (!cancelled) {
          devDebug("editor-open", "load file | ok", {
            fileId8: fileId.slice(0, 20),
          });
          setFile(next);
          setError(null);
          const data = normalizeExcalidrawData(next.data, next.name);
          const scene = toActiveExcalidrawScene(data);
          latestDocumentRef.current = data;
          latestSceneRef.current = scene;
          latestHashRef.current = hashSceneSnapshot(scene);
          cacheExcalidrawDraft(next.id, scene);
          updateLocalCacheServerVersionMeta(
            next.id,
            {
              content_sha256: next.content_sha256 ?? null,
              version: next.version ?? null,
            },
            "excalidraw-open",
          );
          if (!preferLocalRecovery) {
            markDocumentCommitted(next.id, latestHashRef.current);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          if (isServerSyncNotFoundError(err)) {
            handleMissingServerFile(fileId);
            return;
          }
          const message = err instanceof Error ? err.message : String(err);
          devDebug("editor-open", "load file | failed", {
            fileId8: fileId.slice(0, 20),
            message,
          });
          setError(message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fileId, handleMissingServerFile]);

  const documentData = useMemo(
    () => normalizeExcalidrawData(file?.data, file?.name),
    [file?.data, file?.name],
  );

  const initialData = useMemo(
    () => ({
      elements: restoreSceneElements(documentData.elements ?? []),
      appState: restoreSceneAppState(documentData.appState ?? {}, {
        name: file?.name,
      }),
      files: documentData.files ?? {},
      scrollToContent: true,
    }),
    [documentData, file?.name],
  );

  const reloadFromServer = useCallback(
    async (opts?: {
      preserveViewport?: boolean;
      target?: RemoteUpdateTarget;
    }) => {
      if (!fileId || isLocalDraftFileId(fileId)) {
        return;
      }
      const excalidrawAPI = excalidrawAPIRef.current;
      if (!excalidrawAPI) {
        return;
      }

      const next = await loadEditorServerFile(fileId, { force: true });
      if (
        !isRemoteUpdateTargetSatisfied(opts?.target, {
          contentSha256: next.content_sha256 ?? null,
          version: next.version ?? null,
        })
      ) {
        setError("服务器版本已再次变化，请重新处理更新");
        throw new Error("remote update target stale");
      }
      const applied = await applyRemoteExcalidrawScene({
        excalidrawAPI,
        fileId,
        serverFile: next,
        preserveViewport: !!opts?.preserveViewport,
      });
      if (!applied) {
        return;
      }

      const data = normalizeExcalidrawData(next.data, next.name);
      const scene = toActiveExcalidrawScene(data);
      setFile(next);
      setError(null);
      latestDocumentRef.current = data;
      latestSceneRef.current = scene;
      latestHashRef.current = hashSceneSnapshot(scene);
      latestThumbnailRef.current = null;
      markDocumentCommitted(fileId, latestHashRef.current);
    },
    [fileId],
  );

  const saveCurrentDocumentOnce = useCallback(
    async (
      source: ActiveEditorSaveSource = "manual",
      opts?: { forceOverwrite?: boolean },
    ) => {
      if (!fileId || !latestDocumentRef.current || !latestHashRef.current) {
        return false;
      }
      let thumbnail = latestThumbnailRef.current;
      if (!thumbnail && latestSceneRef.current) {
        thumbnail =
          (await generateExcalidrawThumbnailAndCache(
            fileId,
            latestSceneRef.current,
          )) ?? null;
        latestThumbnailRef.current = thumbnail;
      }
      if (isLocalDraftFileId(fileId)) {
        const draftFolderId = file?.folder_id;
        if (shouldSkipLocalDraftFormalSave(source, draftFolderId)) {
          return true;
        }
        if (
          shouldUseNativeSaveDialogForDraft(fileId) ||
          localDraftNeedsSaveFolderPicker(draftFolderId)
        ) {
          openSaveDialog(source === "exit");
          return false;
        }
        const saved = await saveNewDocument({
          kind: "excalidraw",
          name: file?.name ?? "未命名",
          folderId: getLocalDraftPresetFolderIdForFile(fileId, draftFolderId)!,
          draftId: fileId,
          excalidrawScene: latestSceneRef.current,
        });
        const title = file?.name ?? "未命名";
        replaceOpenFileTabAfterSave({
          fromFileId: fileId,
          toFileId: saved.id,
          kind: saved.kind,
          title,
        });
        void openEditorFileTab(
          {
            fileId: saved.id,
            kind: saved.kind,
            title,
          },
          { getCurrentFileId: () => null },
        );
        return true;
      }
      const result = await saveFile(
        latestDocumentRef.current,
        source,
        file?.name,
        thumbnail,
        opts,
      );
      if (result?.content_sha256 || result?.skipped) {
        if (result.content_sha256) {
          finalizeSavedThumbnail({
            fileId,
            kind: "excalidraw",
            name: file?.name ?? DEFAULT_DOCUMENT_DISPLAY_NAME,
            contentSha: result.content_sha256,
            version: result.version ?? null,
            updatedAt: result.updated_at ?? null,
            thumbnail,
          });
        }
        markDocumentCommitted(fileId, latestHashRef.current);
        return true;
      }
      return false;
    },
    [file?.folder_id, file?.name, fileId, openSaveDialog, saveFile],
  );

  const saveCurrentDocumentInner = useCallback(
    async (source: ActiveEditorSaveSource = "manual") => {
      setSaving(true);
      try {
        try {
          return await saveCurrentDocumentOnce(source);
        } catch (error) {
          const conflictResult = await resolveEditorSaveConflict(error, {
            documentName: file?.name ?? null,
            loadRemote: reloadFromServer,
            forceOverwrite: () =>
              saveCurrentDocumentOnce(source, { forceOverwrite: true }),
          });
          if (conflictResult.handled) {
            return conflictResult.saved;
          }
          throw error;
        }
      } finally {
        setSaving(false);
      }
    },
    [file?.name, reloadFromServer, saveCurrentDocumentOnce],
  );

  const saveAndArchiveCurrentVersion = useCallback(async (): Promise<boolean> => {
    if (!fileId || isLocalDraftFileId(fileId)) {
      return false;
    }
    const saved = await saveCurrentDocumentInner("manual");
    if (!saved) {
      return false;
    }
    await ServerSync.createArchive(fileId, CHECKPOINT_LABELS.manual);
    window.dispatchEvent(new CustomEvent("excalidraw-server-saved"));
    return true;
  }, [fileId, saveCurrentDocumentInner]);

  const importLocalExcalidrawFile = useCallback(async () => {
    const excalidrawAPI = excalidrawAPIRef.current;
    if (!excalidrawAPI) {
      return;
    }
    try {
      const picked = await fileOpen({
        description: "Excalidraw files",
        extensions: ["excalidraw", "json", "png", "svg"],
      });
      const scene = await loadExcalidrawFileAsServerSceneData(picked);
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
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      excalidrawAPI.setToast({ message: formatImportErrorMessage(err) });
    }
  }, []);

  const saveCurrentDocument = useCallback(
    (source: ActiveEditorSaveSource = "manual") =>
      enqueueSaveRef.current(() => saveCurrentDocumentInner(source)),
    [saveCurrentDocumentInner],
  );

  useRemoteFileRefresh({
    fileId,
    getDocumentName: () => file?.name ?? DEFAULT_DOCUMENT_DISPLAY_NAME,
    reload: (target) =>
      reloadFromServer({ preserveViewport: true, target }),
    onReloaded: () => {
      excalidrawAPIRef.current?.setToast({ message: "已同步远端更新" });
    },
  });

  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    const settings = getAppSettings();
    if (!settings.autoSaveEnabled || settings.autoSaveIdleSec <= 0) {
      return;
    }
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      void saveCurrentDocument("auto");
    }, settings.autoSaveIdleSec * 1000);
  }, [saveCurrentDocument]);

  const persistLocalExcalidrawSnapshot = useCallback(
    (
      scene: ActiveExcalidrawScene,
      opts?: { scheduleAutoSave?: boolean },
    ): boolean => {
      if (!fileId) {
        return false;
      }
      const canonicalScene = canonicalizeExcalidrawSceneFileName(fileId, scene);
      const modificationState = evaluateCurrentFileModificationState({
        fileId,
        kind: "excalidraw",
        excalidrawScene: canonicalScene,
      });
      applyFileModificationState(fileId, modificationState);
      window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));

      latestDocumentRef.current = scene;
      latestSceneRef.current = scene;
      pendingSnapshotSceneRef.current = null;
      latestHashRef.current =
        modificationState.contentHash ?? hashSceneSnapshot(canonicalScene);

      if (!modificationState.modified) {
        return true;
      }

      if (isLocalDraftFileId(fileId)) {
        notifyLocalDraftEdited(fileId);
      }
      markEditSessionEdited(fileId);
      cacheExcalidrawDraft(fileId, canonicalScene);

      scheduleExcalidrawThumbnailAndCache(fileId, canonicalScene);
      latestThumbnailRef.current = null;
      if (opts?.scheduleAutoSave) {
        scheduleAutoSave();
      }
      return true;
    },
    [fileId, scheduleAutoSave],
  );

  useEffect(() => {
    if (!fileId) {
      return;
    }
    return registerEditorTabSaveHandler(fileId, (source) =>
      saveCurrentDocument(source),
    );
  }, [fileId, saveCurrentDocument]);

  useEffect(() => {
    if (!fileId) {
      return;
    }
    return registerEditorTabSnapshotHandler(fileId, async (source) => {
      if (localDraftTimerRef.current !== null) {
        window.clearTimeout(localDraftTimerRef.current);
        localDraftTimerRef.current = null;
      }
      const scene = pendingSnapshotSceneRef.current ?? latestSceneRef.current;
      if (!fileId || !scene) {
        return { ok: true, reason: "no-scene" };
      }
      const ok = persistLocalExcalidrawSnapshot(scene, {
        scheduleAutoSave: false,
      });
      return {
        ok,
        reason: source === "tab-switch" ? "tab-switch" : "tab-close",
      };
    });
  }, [fileId, persistLocalExcalidrawSnapshot]);

  const discardEditsForLeave = useCallback(async () => {
    if (!fileId) {
      return;
    }
    if (localDraftTimerRef.current !== null) {
      window.clearTimeout(localDraftTimerRef.current);
      localDraftTimerRef.current = null;
    }
    if (isLocalDraftFileId(fileId)) {
      await discardLocalDraftSession(fileId);
      return;
    }
    await discardCommittedFileEditsForLeave(fileId);
    const baselineHash = FileSyncState.getBaselineHash(fileId);
    if (baselineHash) {
      markDocumentCommitted(fileId, baselineHash);
    }
  }, [fileId]);

  useEffect(() => {
    if (!fileId) {
      return;
    }
    return registerEditorTabDiscardHandler(fileId, discardEditsForLeave);
  }, [discardEditsForLeave, fileId]);

  useEffect(() => {
    const onSave = () => {
      void saveCurrentDocument("manual");
    };
    const onExport = () => {
      excalidrawAPIRef.current?.setOpenDialog({ name: "imageExport" });
    };
    const onImport = () => {
      void importLocalExcalidrawFile();
    };
    const onHistory = () => {
      if (!fileId || isLocalDraftFileId(fileId)) {
        return;
      }
      setShowHistoryPanel(true);
    };
    const onEmbed = () => {
      if (!fileId || isLocalDraftFileId(fileId) || isDesktopEditorHub()) {
        return;
      }
      setShowEmbedManager(true);
    };
    const onHostCommand = (event: Event) => {
      const detail = getEditorHostCommandDetail(event);
      if (!detail) {
        return;
      }
      switch (detail.command) {
        case "save":
          onSave();
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
        default:
          break;
      }
    };
    window.addEventListener(EDITOR_HOST_COMMAND_EVENT, onHostCommand);
    window.addEventListener("excalidraw-host-request-save", onSave);
    window.addEventListener("excalidraw-host-open-export", onExport);
    window.addEventListener("excalidraw-host-open-import", onImport);
    window.addEventListener("excalidraw-host-open-history", onHistory);
    window.addEventListener("excalidraw-host-open-embed", onEmbed);
    return () => {
      window.removeEventListener(EDITOR_HOST_COMMAND_EVENT, onHostCommand);
      window.removeEventListener("excalidraw-host-request-save", onSave);
      window.removeEventListener("excalidraw-host-open-export", onExport);
      window.removeEventListener("excalidraw-host-open-import", onImport);
      window.removeEventListener("excalidraw-host-open-history", onHistory);
      window.removeEventListener("excalidraw-host-open-embed", onEmbed);
    };
  }, [fileId, importLocalExcalidrawFile, saveCurrentDocument]);

  const handleChange = useCallback(
    (elements: unknown, appState: unknown, files: unknown) => {
      if (!fileId) {
        return;
      }
      if (isRemoteApplyInProgress(fileId)) {
        if (localDraftTimerRef.current !== null) {
          window.clearTimeout(localDraftTimerRef.current);
          localDraftTimerRef.current = null;
        }
        return;
      }
      // Persistence hygiene (mirrors the web build's getSceneData): persist only
      // canonical document appState via Excalidraw's own cleaner, so drafts/saves
      // don't carry transient UI (open menu, selection, viewport) and a restored
      // draft never re-opens menus or re-selects elements. Document identity
      // itself is owned by hashSceneSnapshot — this only governs what we store.
      const mergedAppState = {
        ...cleanAppStateForExport(
          (typeof appState === "object" && appState !== null
            ? appState
            : {}) as Partial<AppState>,
        ),
        name: file?.name,
      };
      const nextData = {
        type: "excalidraw",
        version: getSceneVersion(documentData),
        source: "editorhub",
        elements,
        appState: mergedAppState,
        files,
      } as ActiveExcalidrawScene;
      const scene: ActiveExcalidrawScene = {
        ...nextData,
        elements,
        appState: mergedAppState,
        files,
      };
      pendingSnapshotSceneRef.current = scene;

      if (localDraftTimerRef.current !== null) {
        window.clearTimeout(localDraftTimerRef.current);
      }
      localDraftTimerRef.current = window.setTimeout(() => {
        localDraftTimerRef.current = null;
        persistLocalExcalidrawSnapshot(scene, { scheduleAutoSave: true });
      }, 800);
    },
    [documentData, file?.name, fileId, persistLocalExcalidrawSnapshot],
  );

  useEffect(() => {
    return () => {
      if (localDraftTimerRef.current !== null) {
        window.clearTimeout(localDraftTimerRef.current);
      }
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  if (error) {
    return <div style={{ padding: 24, color: "#c92a2a" }}>{error}</div>;
  }

  if (!file) {
    return <div style={{ padding: 24 }}>正在加载...</div>;
  }

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ExcalidrawAPIProvider>
        <Excalidraw
          key={file.id}
          initialData={initialData as never}
          name={file.name}
          theme={
            (documentData.appState as { theme?: string } | undefined)?.theme ===
            "dark"
              ? THEME.DARK
              : THEME.LIGHT
          }
          isCollaborating={false}
          onExcalidrawAPI={(api) => {
            excalidrawAPIRef.current = api;
          }}
          onChange={handleChange}
          UIOptions={{
            canvasActions: {
              saveToActiveFile: false,
            },
          }}
          handleKeyboardGlobally={true}
        >
          <AppWelcomeScreen />
          <MainMenu>
            <MainMenu.DefaultItems.Export />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.SearchMenu />
            <MainMenu.DefaultItems.Help />
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.Separator />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
          </MainMenu>
          {fileId && !isLocalDraftFileId(fileId) && showHistoryPanel && (
            <ArchivePanel
              fileId={fileId}
              saving={saving}
              onSave={() => saveCurrentDocument("manual")}
              onArchive={saveAndArchiveCurrentVersion}
              readCurrentModificationState={() => {
                const scene = latestSceneRef.current;
                if (!scene || !fileId) {
                  return readStoredFileModificationState(fileId, "excalidraw");
                }
                return evaluateCurrentFileModificationState({
                  fileId,
                  kind: "excalidraw",
                  excalidrawScene: scene,
                });
              }}
              onAfterRestore={async () => {
                await reloadFromServer();
              }}
              onClose={() => setShowHistoryPanel(false)}
            />
          )}
        </Excalidraw>
      </ExcalidrawAPIProvider>
      {fileId && !isLocalDraftFileId(fileId) && !isDesktopEditorHub() && (
        <EmbedTokenManager
          fileId={fileId}
          fileName={file.name ?? DEFAULT_DOCUMENT_DISPLAY_NAME}
          open={showEmbedManager}
          onClose={() => setShowEmbedManager(false)}
        />
      )}
      <SaveNewDocumentDialog
        open={saveOpen}
        saving={saveInFlight}
        overlayDismiss={saveOverlayDismiss}
        defaultName={defaultSaveName()}
        documentKind="excalidraw"
        presetFolderId={presetFolderId()}
        allowOpenLocalFolder={allowOpenLocalFolder}
        openLocalFolderBusy={openLocalFolderBusy}
        onOpenLocalFolder={openLocalFolderForSave}
        onClose={dismissSave}
        onSave={commitSave}
      />
    </div>
  );
}
