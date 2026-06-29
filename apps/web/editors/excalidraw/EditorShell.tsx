import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { EditorShellCacheProps } from "../editorShellCacheProps";
import { resolvePaneForeground } from "../editorShellCacheProps";

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
import { bumpRecentEditOrder } from "../../data/recentFiles";
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
import { resolveExcalidrawInitialDocumentData } from "./resolveExcalidrawInitialDocumentData";
import {
  beginExcalidrawPointerDrag,
  endExcalidrawPointerDrag,
  isExcalidrawPointerDragActive,
  runAfterExcalidrawPointerDrag,
  shouldDeferHeavyHostWorkForExcalidraw,
} from "./excalidrawPointerDrag";
import {
  isServerSyncNotFoundError,
  ServerSync,
  type ServerFile,
} from "../../data/ServerSync";
import { hashSceneSnapshot } from "../../data/sceneHash";
import { useEditorDocumentTitle } from "../../lib/appBranding";
import { isDebugRuntimeEnabled } from "../../data/debugCapability";
import { devDebug } from "../../lib/devDebug";
import {
  traceExcalidrawDragChange,
  recordExcalidrawDragHostChange,
  traceExcalidrawDragPointer,
  traceExcalidrawDragSessionEnd,
  traceExcalidrawDragStage,
  traceIssueDiag,
} from "../../lib/issueDiagTrace";
import { isDesktopEditorHub } from "../../lib/runtimePlatform";
import { markEditSessionOpened } from "../../data/editSessionService";
import { createSerializedSaveRunner } from "../../data/serializedSave";
import { updateLocalCacheServerVersionMeta } from "../../data/documentSessionVersionSync";
import { finalizeSavedThumbnail } from "../../data/thumbnailLifecycle";
import { useRemoteFileRefresh } from "../../hooks/useRemoteFileRefresh";
import { useEditorIdleAutoSave } from "../../hooks/useEditorIdleAutoSave";
import {
  releaseEditorPaneEditPipelineHold,
  retainEditorPaneEditPipelineHold,
  transferEditorPaneEditPipelineHold,
} from "../../shell/editorPaneEditPipeline";
import { useEditorPaneLifecycle } from "../../shell/editorPaneLifecycle";
import {
  shouldKeepEditorPaneRunningInBackground,
  subscribeEditorPaneRunState,
} from "../../shell/editorPaneRunState";
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
import {
  flushExcalidrawBrowserSceneSave,
  resolveExcalidrawBrowserViewportOverlay,
  scheduleExcalidrawBrowserSceneSave,
} from "./excalidrawBrowserViewport";
import { traceExcalidrawDragGeometry } from "./excalidrawDragGeometry";
import { useForkFileSave } from "./useForkFileSave";
import { verifyExcalidrawRemoteAfterCachedOpen } from "./verifyExcalidrawCachedOpen";
import { revealForkCanvasAfterFit } from "../../data/scrollEditorToFit";

import type { ActiveEditorSaveSource } from "../../data/activeEditorSaveBridge";
import type { ExcalidrawThumbnailScene } from "../../data/excalidrawThumbnail";
import type { ForkSceneSnapshot } from "../../data/forkFileTypes";
import type { FileModificationState } from "../../data/fileModificationState";

const EXCALIDRAW_DRAFT_CACHE_DEBOUNCE_MS = 450;

const EXCALIDRAW_UI_OPTIONS = {
  canvasActions: {
    saveToActiveFile: false,
  },
} as const;

type RawExcalidrawChange = {
  elements: unknown;
  appState: unknown;
  files: unknown;
};

type ActiveExcalidrawScene = ForkSceneSnapshot &
  ExcalidrawThumbnailScene & {
    version?: number;
  };

function countSceneElements(elements: unknown): number | null {
  return Array.isArray(elements) ? elements.length : null;
}

function countSceneFiles(files: unknown): number | null {
  return files && typeof files === "object" && !Array.isArray(files)
    ? Object.keys(files).length
    : null;
}

function elapsedMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

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

export default function ExcalidrawEditorShell(
  props: EditorShellCacheProps = {},
) {
  const isPaneForeground = resolvePaneForeground(props);
  const pinnedFileId = props.pinnedFileId;
  const [file, setFile] = useState<ServerFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showEmbedManager, setShowEmbedManager] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileId = props.pinnedFileId ?? getFileIdFromHash();
  const saveFile = useForkFileSave(fileId);
  const localDraftTimerRef = useRef<number | null>(null);
  const autoSaveTimerRef = useRef<number | null>(null);
  const releaseAutoSavePipelineRef = useRef<(() => void) | null>(null);
  const releaseSavePipelineRef = useRef<(() => void) | null>(null);
  const latestDocumentRef = useRef<unknown | null>(null);
  const latestSceneRef = useRef<ActiveExcalidrawScene | null>(null);
  const pendingSnapshotSceneRef = useRef<ActiveExcalidrawScene | null>(null);
  const latestHashRef = useRef<string | null>(null);
  const latestThumbnailRef = useRef<string | null>(null);
  const enqueueSaveRef = useRef(createSerializedSaveRunner<boolean>());
  const saveCurrentDocumentRef = useRef<
    (source?: ActiveEditorSaveSource) => Promise<boolean> | boolean
  >(() => false);
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const editorOpenSettledRef = useRef(false);
  const preferLocalRecoveryRef = useRef(false);
  const paneForegroundSettlePendingRef = useRef(false);
  const syncedAtForegroundRef = useRef(false);
  /** 本会话内已建立 dirty（避免拖动时每帧读 localStorage / 全量 sync）。保存成功后清零。 */
  const excalidrawDirtySessionRef = useRef(false);
  const pendingRawChangeRef = useRef<RawExcalidrawChange | null>(null);
  const hasBrowserViewportRef = useRef(false);
  const pendingCachedOpenVerifyRef = useRef(false);
  const flushPendingExcalidrawDraftRef = useRef<
    (opts?: {
      scheduleThumbnail?: boolean;
      bumpRecent?: boolean;
      forceRecent?: boolean;
      reason?: string;
    }) => void
  >(() => {});
  const [backgroundKeepRunning, setBackgroundKeepRunning] = useState(() =>
    fileId ? shouldKeepEditorPaneRunningInBackground(fileId) : false,
  );
  const shouldMountExcalidrawCanvas = isPaneForeground || backgroundKeepRunning;
  const markExcalidrawDocumentCommitted = useCallback(
    (committedFileId: string, hash: string) => {
      markDocumentCommitted(committedFileId, hash);
      if (committedFileId === fileId) {
        excalidrawDirtySessionRef.current = false;
      }
    },
    [fileId],
  );
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

  useEditorPaneLifecycle({
    isForeground: isPaneForeground,
    onForeground: () => {
      syncedAtForegroundRef.current = fileId
        ? !FileSyncState.hasUnsavedChanges(fileId)
        : true;
      paneForegroundSettlePendingRef.current = true;
      const api = excalidrawAPIRef.current;
      if (api && typeof api.refresh === "function") {
        api.refresh();
      }
    },
    onBackground: () => {
      if (localDraftTimerRef.current !== null) {
        window.clearTimeout(localDraftTimerRef.current);
        localDraftTimerRef.current = null;
      }
      if (
        pendingRawChangeRef.current &&
        fileId &&
        excalidrawDirtySessionRef.current
      ) {
        flushPendingExcalidrawDraftRef.current({
          scheduleThumbnail: true,
          bumpRecent: true,
          forceRecent: true,
        });
      } else {
        const pending =
          pendingSnapshotSceneRef.current ?? latestSceneRef.current;
        if (pending && fileId) {
          const canonicalScene = canonicalizeExcalidrawSceneFileName(
            fileId,
            pending,
          );
          cacheExcalidrawDraft(fileId, canonicalScene);
          scheduleExcalidrawThumbnailAndCache(fileId, canonicalScene);
        }
      }
      if (fileId && excalidrawAPIRef.current) {
        const api = excalidrawAPIRef.current;
        scheduleExcalidrawBrowserSceneSave(
          fileId,
          api.getSceneElementsIncludingDeleted(),
          api.getAppState(),
        );
        flushExcalidrawBrowserSceneSave();
      }
      if (!fileId || !FileSyncState.hasUnsavedChanges(fileId)) {
        return;
      }
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      void saveCurrentDocumentRef.current?.("auto");
    },
  });

  useEffect(() => {
    if (fileId) {
      markEditSessionOpened(fileId);
    }
  }, [fileId]);

  useEffect(() => {
    if (!fileId) {
      setBackgroundKeepRunning(false);
      return;
    }
    const sync = () => {
      setBackgroundKeepRunning(shouldKeepEditorPaneRunningInBackground(fileId));
    };
    sync();
    return subscribeEditorPaneRunState(sync);
  }, [fileId]);

  useEffect(() => {
    if (!shouldMountExcalidrawCanvas) {
      excalidrawAPIRef.current = null;
    }
  }, [shouldMountExcalidrawCanvas]);

  useEffect(() => {
    if (!isDebugRuntimeEnabled()) {
      return;
    }
    traceIssueDiag(
      "excalidraw.drag",
      "pane.state",
      {
        fileId8: fileId ? fileId.slice(0, 8) : null,
        isPaneForeground,
        shouldMountExcalidrawCanvas,
        viewModeEnabled: !isPaneForeground,
        backgroundKeepRunning,
      },
      "branch",
    );
  }, [
    backgroundKeepRunning,
    fileId,
    isPaneForeground,
    shouldMountExcalidrawCanvas,
  ]);

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
    editorOpenSettledRef.current = false;
    excalidrawDirtySessionRef.current = false;
    pendingCachedOpenVerifyRef.current = false;
    const preferLocalRecovery = FileSyncState.hasUnsavedChanges(fileId);
    preferLocalRecoveryRef.current = preferLocalRecovery;
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
            markExcalidrawDocumentCommitted(next.id, latestHashRef.current);
            editorOpenSettledRef.current = false;
          } else {
            editorOpenSettledRef.current = true;
            excalidrawDirtySessionRef.current = true;
            if (!isLocalDraftFileId(fileId)) {
              pendingCachedOpenVerifyRef.current = true;
            }
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

  const initialData = useMemo(() => {
    const data = resolveExcalidrawInitialDocumentData(
      file?.data,
      file?.name,
      latestDocumentRef.current,
    );
    const sceneForOverlay = normalizeExcalidrawData(data, file?.name);
    const overlay = fileId
      ? resolveExcalidrawBrowserViewportOverlay(fileId, sceneForOverlay)
      : null;
    hasBrowserViewportRef.current = !!overlay;
    return {
      elements: restoreSceneElements(data.elements ?? []),
      appState: restoreSceneAppState(data.appState ?? {}, {
        name: file?.name,
        ...(overlay ?? {}),
      }),
      files: data.files ?? {},
      ...(overlay ? {} : { scrollToContent: true }),
    };
  }, [documentData, file?.data, file?.name, fileId, shouldMountExcalidrawCanvas]);

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
      markExcalidrawDocumentCommitted(fileId, latestHashRef.current);
    },
    [fileId],
  );

  const saveCurrentDocumentOnce = useCallback(
    async (
      source: ActiveEditorSaveSource = "manual",
      opts?: { forceOverwrite?: boolean },
    ) => {
      if (!fileId || !latestSceneRef.current) {
        return false;
      }
      if (pendingRawChangeRef.current) {
        flushPendingExcalidrawDraftRef.current({
          scheduleThumbnail: false,
          bumpRecent: false,
          reason: "pre-save",
        });
      }
      const canonicalScene = canonicalizeExcalidrawSceneFileName(
        fileId,
        latestSceneRef.current,
      );
      latestHashRef.current = hashSceneSnapshot(canonicalScene);
      latestDocumentRef.current = latestSceneRef.current;
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
        const title = saved.name;
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
        markExcalidrawDocumentCommitted(fileId, latestHashRef.current);
        setFile((current) => {
          if (!current) {
            return current;
          }
          const data = latestDocumentRef.current ?? current.data;
          return {
            ...current,
            data,
            content_sha256:
              result.content_sha256 ?? current.content_sha256 ?? null,
            version: result.version ?? current.version ?? null,
            updated_at: result.updated_at ?? current.updated_at,
          };
        });
        return true;
      }
      return false;
    },
    [file?.folder_id, file?.name, fileId, openSaveDialog, saveFile],
  );

  const saveCurrentDocumentInner = useCallback(
    async (source: ActiveEditorSaveSource = "manual") => {
      if (source === "auto" && shouldDeferHeavyHostWorkForExcalidraw()) {
        runAfterExcalidrawPointerDrag(() => {
          void saveCurrentDocumentInner("auto");
        });
        return false;
      }
      if (fileId) {
        transferEditorPaneEditPipelineHold(
          releaseAutoSavePipelineRef,
          releaseSavePipelineRef,
          fileId,
          "excalidraw-save",
        );
      }
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
        releaseEditorPaneEditPipelineHold(releaseSavePipelineRef);
      }
    },
    [file?.name, fileId, reloadFromServer, saveCurrentDocumentOnce],
  );

  const saveAndArchiveCurrentVersion =
    useCallback(async (): Promise<boolean> => {
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

  useEffect(() => {
    saveCurrentDocumentRef.current = saveCurrentDocument;
  }, [saveCurrentDocument]);

  const resetExcalidrawIdleAutoSaveTimer = useCallback(() => {
    const settings = getAppSettings();
    if (!settings.autoSaveEnabled || settings.autoSaveIdleSec <= 0 || !fileId) {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      return;
    }
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    const schedule = () => {
      autoSaveTimerRef.current = window.setTimeout(() => {
        autoSaveTimerRef.current = null;
        if (shouldDeferHeavyHostWorkForExcalidraw()) {
          runAfterExcalidrawPointerDrag(schedule);
          return;
        }
        void saveCurrentDocument("auto");
      }, settings.autoSaveIdleSec * 1000);
    };
    if (shouldDeferHeavyHostWorkForExcalidraw()) {
      runAfterExcalidrawPointerDrag(schedule);
      return;
    }
    schedule();
  }, [fileId, saveCurrentDocument]);

  const touchExcalidrawIdleAutoSaveTimer = useCallback(() => {
    if (
      !releaseAutoSavePipelineRef.current &&
      autoSaveTimerRef.current === null
    ) {
      return;
    }
    resetExcalidrawIdleAutoSaveTimer();
  }, [resetExcalidrawIdleAutoSaveTimer]);

  const armExcalidrawIdleAutoSave = useCallback(() => {
    const settings = getAppSettings();
    if (!settings.autoSaveEnabled || settings.autoSaveIdleSec <= 0 || !fileId) {
      releaseEditorPaneEditPipelineHold(releaseAutoSavePipelineRef);
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      return;
    }
    if (!releaseAutoSavePipelineRef.current) {
      retainEditorPaneEditPipelineHold(
        releaseAutoSavePipelineRef,
        fileId,
        "excalidraw-idle-save",
      );
    }
    resetExcalidrawIdleAutoSaveTimer();
  }, [fileId, resetExcalidrawIdleAutoSaveTimer]);

  const syncExcalidrawModificationState = useCallback(
    (
      scene: ActiveExcalidrawScene,
      opts?: { silent?: boolean },
    ): FileModificationState | null => {
      if (!fileId) {
        return null;
      }
      const canonicalScene = canonicalizeExcalidrawSceneFileName(fileId, scene);
      const contentHash = hashSceneSnapshot(canonicalScene);

      const settleHydrateMismatch = (hash: string): FileModificationState => {
        markExcalidrawDocumentCommitted(fileId, hash);
        editorOpenSettledRef.current = true;
        paneForegroundSettlePendingRef.current = false;
        latestDocumentRef.current = scene;
        latestSceneRef.current = scene;
        pendingSnapshotSceneRef.current = null;
        latestHashRef.current = hash;
        return evaluateCurrentFileModificationState({
          fileId,
          kind: "excalidraw",
          excalidrawScene: canonicalScene,
        });
      };

      if (!editorOpenSettledRef.current) {
        if (!preferLocalRecoveryRef.current) {
          if (contentHash === latestHashRef.current) {
            return settleHydrateMismatch(contentHash);
          }
          editorOpenSettledRef.current = true;
        } else {
          editorOpenSettledRef.current = true;
        }
      }

      const modificationState = evaluateCurrentFileModificationState({
        fileId,
        kind: "excalidraw",
        excalidrawScene: canonicalScene,
      });

      if (
        paneForegroundSettlePendingRef.current &&
        syncedAtForegroundRef.current &&
        modificationState.modified &&
        modificationState.contentHash
      ) {
        return settleHydrateMismatch(modificationState.contentHash);
      }
      if (paneForegroundSettlePendingRef.current) {
        paneForegroundSettlePendingRef.current = false;
      }

      applyFileModificationState(fileId, modificationState, {
        silent: opts?.silent,
      });

      latestDocumentRef.current = scene;
      latestSceneRef.current = scene;
      pendingSnapshotSceneRef.current = null;
      latestHashRef.current =
        modificationState.contentHash ?? hashSceneSnapshot(canonicalScene);

      return modificationState;
    },
    [fileId, markExcalidrawDocumentCommitted],
  );

  const buildCanonicalExcalidrawSceneFromChange = useCallback(
    (change: RawExcalidrawChange): ActiveExcalidrawScene => {
      const mergedAppState = {
        ...cleanAppStateForExport(
          (typeof change.appState === "object" && change.appState !== null
            ? change.appState
            : {}) as Partial<AppState>,
        ),
        name: file?.name,
      };
      return {
        type: "excalidraw",
        version: getSceneVersion(documentData),
        source: "editorhub",
        elements: change.elements,
        appState: mergedAppState,
        files: change.files,
      } as ActiveExcalidrawScene;
    },
    [documentData, file?.name],
  );

  const persistLocalExcalidrawDraftCache = useCallback(
    (
      scene: ActiveExcalidrawScene,
      opts?: {
        scheduleThumbnail?: boolean;
        bumpRecent?: boolean;
        forceRecent?: boolean;
        reason?: string;
      },
    ) => {
      if (!fileId) {
        return;
      }
      const totalStartedAt = performance.now();
      const canonicalStartedAt = performance.now();
      const canonicalScene = canonicalizeExcalidrawSceneFileName(fileId, scene);
      const canonicalMs = elapsedMs(canonicalStartedAt);
      const cacheStartedAt = performance.now();
      cacheExcalidrawDraft(fileId, canonicalScene);
      const cacheMs = elapsedMs(cacheStartedAt);
      let thumbnailScheduleMs = 0;
      if (opts?.scheduleThumbnail !== false) {
        const thumbnailStartedAt = performance.now();
        const scheduleThumb = () =>
          scheduleExcalidrawThumbnailAndCache(fileId, canonicalScene);
        if (shouldDeferHeavyHostWorkForExcalidraw()) {
          runAfterExcalidrawPointerDrag(scheduleThumb);
        } else {
          scheduleThumb();
        }
        thumbnailScheduleMs = elapsedMs(thumbnailStartedAt);
      }
      latestThumbnailRef.current = null;
      let recentMs = 0;
      if (opts?.bumpRecent !== false) {
        const recentStartedAt = performance.now();
        bumpRecentEditOrder({ fileId }, { force: opts?.forceRecent });
        recentMs = elapsedMs(recentStartedAt);
      }
      if (isDebugRuntimeEnabled()) {
        traceExcalidrawDragStage("persist.cache", {
          fileId8: fileId.slice(0, 8),
          reason: opts?.reason ?? "unknown",
          elements: countSceneElements(canonicalScene.elements),
          files: countSceneFiles(canonicalScene.files),
          scheduleThumbnail: opts?.scheduleThumbnail !== false,
          bumpRecent: opts?.bumpRecent !== false,
          canonicalMs,
          cacheMs,
          thumbnailScheduleMs,
          recentMs,
          totalMs: elapsedMs(totalStartedAt),
        });
      }
    },
    [fileId],
  );

  const flushPendingExcalidrawDraft = useCallback(
    (opts?: {
      scheduleThumbnail?: boolean;
      bumpRecent?: boolean;
      forceRecent?: boolean;
      reason?: string;
      /** 合并 sync 通知到 flush 结束后一次性 emit（仅 pointer-up 落盘）。 */
      silentModificationState?: boolean;
    }) => {
      const totalStartedAt = performance.now();
      const raw = pendingRawChangeRef.current;
      if (!raw || !fileId) {
        if (isDebugRuntimeEnabled()) {
          traceExcalidrawDragStage("flush.skip", {
            reason: opts?.reason ?? "unknown",
            hasRaw: !!raw,
            hasFileId: !!fileId,
          });
        }
        return;
      }
      const buildStartedAt = performance.now();
      const scene = buildCanonicalExcalidrawSceneFromChange(raw);
      const buildMs = elapsedMs(buildStartedAt);
      latestSceneRef.current = scene;
      latestDocumentRef.current = scene;
      pendingSnapshotSceneRef.current = scene;
      const dirtyBefore = excalidrawDirtySessionRef.current;
      let syncMs = 0;
      let modified: boolean | null = null;
      if (!excalidrawDirtySessionRef.current) {
        const syncStartedAt = performance.now();
        const modificationState = syncExcalidrawModificationState(scene, {
          silent: opts?.silentModificationState === true,
        });
        syncMs = elapsedMs(syncStartedAt);
        modified = modificationState?.modified ?? null;
        if (!modificationState?.modified) {
          pendingRawChangeRef.current = null;
          if (isDebugRuntimeEnabled()) {
            traceExcalidrawDragStage("flush.clean", {
              fileId8: fileId.slice(0, 8),
              reason: opts?.reason ?? "unknown",
              buildMs,
              syncMs,
              totalMs: elapsedMs(totalStartedAt),
            });
          }
          return;
        }
        excalidrawDirtySessionRef.current = true;
        if (isLocalDraftFileId(fileId)) {
          notifyLocalDraftEdited(fileId);
        }
        markEditSessionEdited(fileId);
        armExcalidrawIdleAutoSave();
      } else {
        syncExcalidrawModificationState(scene, {
          silent: opts?.silentModificationState === true,
        });
        touchExcalidrawIdleAutoSaveTimer();
      }
      const persistStartedAt = performance.now();
      persistLocalExcalidrawDraftCache(scene, opts);
      const persistMs = elapsedMs(persistStartedAt);
      pendingRawChangeRef.current = null;
      if (isDebugRuntimeEnabled()) {
        traceExcalidrawDragStage("flush.done", {
          fileId8: fileId.slice(0, 8),
          reason: opts?.reason ?? "unknown",
          dirtyBefore,
          modified,
          elements: countSceneElements(scene.elements),
          files: countSceneFiles(scene.files),
          buildMs,
          syncMs,
          persistMs,
          totalMs: elapsedMs(totalStartedAt),
        });
      }
    },
    [
      armExcalidrawIdleAutoSave,
      buildCanonicalExcalidrawSceneFromChange,
      fileId,
      markEditSessionEdited,
      persistLocalExcalidrawDraftCache,
      syncExcalidrawModificationState,
      touchExcalidrawIdleAutoSaveTimer,
    ],
  );

  const finishExcalidrawPointerInteraction = useCallback(
    (reason: string) => {
      const totalStartedAt = performance.now();
      if (localDraftTimerRef.current !== null) {
        window.clearTimeout(localDraftTimerRef.current);
        localDraftTimerRef.current = null;
      }
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      let flushed = false;
      try {
        if (pendingRawChangeRef.current) {
          flushed = true;
          flushPendingExcalidrawDraft({
            scheduleThumbnail: false,
            bumpRecent: false,
            forceRecent: false,
            silentModificationState: true,
            reason,
          });
        }
      } finally {
        endExcalidrawPointerDrag();
        if (fileId && excalidrawAPIRef.current) {
          const api = excalidrawAPIRef.current;
          scheduleExcalidrawBrowserSceneSave(
            fileId,
            api.getSceneElementsIncludingDeleted(),
            api.getAppState(),
          );
          flushExcalidrawBrowserSceneSave();
        }
        if (flushed) {
          runAfterExcalidrawPointerDrag(() => {
            const scene = latestSceneRef.current;
            if (fileId && scene) {
              scheduleExcalidrawThumbnailAndCache(fileId, scene);
              bumpRecentEditOrder({ fileId }, { force: true });
            }
            const notifyStartedAt = performance.now();
            FileSyncState.notifySyncState();
            const notifyMs = elapsedMs(notifyStartedAt);
            if (isDebugRuntimeEnabled() && notifyMs > 4) {
              traceExcalidrawDragStage("pointer.notifySyncState", {
                reason,
                notifyMs,
                deferred: true,
              });
            }
          });
        }
      }
      const totalMs = elapsedMs(totalStartedAt);
      if (isDebugRuntimeEnabled()) {
        traceExcalidrawDragStage("pointer.finish", {
          reason,
          flushed,
          totalMs,
        });
      }
      return { flushed, totalMs };
    },
    [fileId, flushPendingExcalidrawDraft],
  );

  flushPendingExcalidrawDraftRef.current = flushPendingExcalidrawDraft;

  useRemoteFileRefresh({
    fileId,
    getDocumentName: () => file?.name ?? DEFAULT_DOCUMENT_DISPLAY_NAME,
    reload: (target) => reloadFromServer({ preserveViewport: true, target }),
    onReloaded: () => {
      excalidrawAPIRef.current?.setToast({ message: "已同步远端更新" });
    },
  });

  useEditorIdleAutoSave(
    fileId,
    isPaneForeground,
    () => {
      armExcalidrawIdleAutoSave();
    },
    {
      allowInactiveFile: !!pinnedFileId,
      rearmKey: isPaneForeground,
      onIdleDisabled: () => {
        if (autoSaveTimerRef.current !== null) {
          window.clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
        releaseEditorPaneEditPipelineHold(releaseAutoSavePipelineRef);
      },
    },
  );

  const scheduleAutoSave = useCallback(() => {
    armExcalidrawIdleAutoSave();
  }, [armExcalidrawIdleAutoSave]);

  const persistLocalExcalidrawSnapshot = useCallback(
    (
      scene: ActiveExcalidrawScene,
      opts?: { scheduleAutoSave?: boolean },
    ): boolean => {
      const modificationState = syncExcalidrawModificationState(scene);
      if (!modificationState) {
        return true;
      }
      if (!modificationState.modified) {
        return true;
      }
      if (!fileId) {
        return true;
      }
      if (isLocalDraftFileId(fileId)) {
        notifyLocalDraftEdited(fileId);
      }
      markEditSessionEdited(fileId);
      persistLocalExcalidrawDraftCache(scene);
      if (opts?.scheduleAutoSave) {
        scheduleAutoSave();
      }
      return true;
    },
    [
      fileId,
      persistLocalExcalidrawDraftCache,
      scheduleAutoSave,
      syncExcalidrawModificationState,
    ],
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
      const snapshotStartedAt = performance.now();
      if (localDraftTimerRef.current !== null) {
        window.clearTimeout(localDraftTimerRef.current);
        localDraftTimerRef.current = null;
      }
      if (pendingRawChangeRef.current && excalidrawDirtySessionRef.current) {
        flushPendingExcalidrawDraftRef.current({
          scheduleThumbnail: false,
          bumpRecent: false,
          reason: `snapshot-${source}`,
        });
      }
      const scene = latestSceneRef.current;
      if (!fileId || !scene) {
        if (isDebugRuntimeEnabled()) {
          traceExcalidrawDragStage("snapshot.done", {
            fileId8: fileId ? fileId.slice(0, 8) : null,
            source,
            reason: "no-scene",
            totalMs: elapsedMs(snapshotStartedAt),
          });
        }
        return { ok: true, reason: "no-scene" };
      }
      const persistStartedAt = performance.now();
      const ok = persistLocalExcalidrawSnapshot(scene, {
        scheduleAutoSave: false,
      });
      if (isDebugRuntimeEnabled()) {
        traceExcalidrawDragStage("snapshot.done", {
          fileId8: fileId.slice(0, 8),
          source,
          ok,
          persistMs: elapsedMs(persistStartedAt),
          totalMs: elapsedMs(snapshotStartedAt),
        });
      }
      return {
        ok: source === "tab-close" ? true : ok,
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
      markExcalidrawDocumentCommitted(fileId, baselineHash);
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
      const handleStartedAt = performance.now();
      if (!fileId) {
        return;
      }
      if (!isPaneForeground) {
        return;
      }
      if (isRemoteApplyInProgress(fileId)) {
        if (localDraftTimerRef.current !== null) {
          window.clearTimeout(localDraftTimerRef.current);
          localDraftTimerRef.current = null;
        }
        if (isDebugRuntimeEnabled()) {
          traceExcalidrawDragChange({
            fileId8: fileId.slice(0, 8),
            branch: "remote-apply-skip",
            handleMs: elapsedMs(handleStartedAt),
            pointerActive: isExcalidrawPointerDragActive(),
          });
        }
        return;
      }

      pendingRawChangeRef.current = { elements, appState, files };

      if (!isExcalidrawPointerDragActive()) {
        scheduleExcalidrawBrowserSceneSave(fileId, elements, appState);
      }

      if (isExcalidrawPointerDragActive()) {
        recordExcalidrawDragHostChange(elapsedMs(handleStartedAt));
        return;
      }

      let openSettleMs = 0;
      if (!editorOpenSettledRef.current) {
        const openSettleStartedAt = performance.now();
        const scene = buildCanonicalExcalidrawSceneFromChange({
          elements,
          appState,
          files,
        });
        if (
          hashSceneSnapshot(
            canonicalizeExcalidrawSceneFileName(fileId, scene),
          ) === latestHashRef.current
        ) {
          if (isDebugRuntimeEnabled()) {
            traceExcalidrawDragChange({
              fileId8: fileId.slice(0, 8),
              branch: "open-settle-clean",
              handleMs: elapsedMs(handleStartedAt),
              openSettleMs: elapsedMs(openSettleStartedAt),
              dirtySession: excalidrawDirtySessionRef.current,
              pointerActive: isExcalidrawPointerDragActive(),
            });
          }
          return;
        }
        openSettleMs = elapsedMs(openSettleStartedAt);
      }

      let syncMs = 0;
      if (excalidrawDirtySessionRef.current) {
        touchExcalidrawIdleAutoSaveTimer();
      } else {
        const syncStartedAt = performance.now();
        const scene = buildCanonicalExcalidrawSceneFromChange({
          elements,
          appState,
          files,
        });
        const modificationState = syncExcalidrawModificationState(scene);
        syncMs = elapsedMs(syncStartedAt);
        if (!modificationState?.modified) {
          if (isDebugRuntimeEnabled()) {
            traceExcalidrawDragChange({
              fileId8: fileId.slice(0, 8),
              branch: "unmodified",
              handleMs: elapsedMs(handleStartedAt),
              openSettleMs,
              syncMs,
              dirtySession: excalidrawDirtySessionRef.current,
              pointerActive: isExcalidrawPointerDragActive(),
            });
          }
          return;
        }
        excalidrawDirtySessionRef.current = true;
        if (isLocalDraftFileId(fileId)) {
          notifyLocalDraftEdited(fileId);
        }
        markEditSessionEdited(fileId);
        armExcalidrawIdleAutoSave();
      }

      if (localDraftTimerRef.current !== null) {
        window.clearTimeout(localDraftTimerRef.current);
      }
      localDraftTimerRef.current = window.setTimeout(() => {
        localDraftTimerRef.current = null;
        if (isExcalidrawPointerDragActive()) {
          return;
        }
        flushPendingExcalidrawDraft({
          scheduleThumbnail: true,
          bumpRecent: true,
          reason: "debounce",
        });
      }, EXCALIDRAW_DRAFT_CACHE_DEBOUNCE_MS);

      if (isDebugRuntimeEnabled()) {
        traceExcalidrawDragChange({
          fileId8: fileId.slice(0, 8),
          branch: "normal-debounced",
          handleMs: Math.round(performance.now() - handleStartedAt),
          openSettleMs,
          syncMs,
          dirtySession: excalidrawDirtySessionRef.current,
          pointerActive: isExcalidrawPointerDragActive(),
          elements: countSceneElements(elements),
          files: countSceneFiles(files),
        });
      }
    },
    [
      buildCanonicalExcalidrawSceneFromChange,
      fileId,
      flushPendingExcalidrawDraft,
      armExcalidrawIdleAutoSave,
      syncExcalidrawModificationState,
      touchExcalidrawIdleAutoSaveTimer,
      isPaneForeground,
    ],
  );

  useEffect(() => {
    return () => {
      if (localDraftTimerRef.current !== null) {
        window.clearTimeout(localDraftTimerRef.current);
      }
      flushExcalidrawBrowserSceneSave();
      releaseEditorPaneEditPipelineHold(releaseAutoSavePipelineRef);
      releaseEditorPaneEditPipelineHold(releaseSavePipelineRef);
    };
  }, []);

  if (error) {
    return <div style={{ padding: 24, color: "#c92a2a" }}>{error}</div>;
  }

  if (!file) {
    return <div style={{ padding: 24 }}>正在加载...</div>;
  }

  return (
    <div
      style={{ width: "100%", height: "100%" }}
      onPointerDownCapture={(event) => {
        if (event.button !== 0) {
          return;
        }
        beginExcalidrawPointerDrag();
        if (localDraftTimerRef.current !== null) {
          window.clearTimeout(localDraftTimerRef.current);
          localDraftTimerRef.current = null;
        }
        if (autoSaveTimerRef.current !== null) {
          window.clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
        if (isDebugRuntimeEnabled()) {
          traceExcalidrawDragPointer("down", {
            fileId8: fileId ? fileId.slice(0, 8) : null,
            pointerType: event.pointerType,
            isPaneForeground,
            source: "wrapper.capture",
          });
          traceExcalidrawDragGeometry(excalidrawAPIRef.current, event.currentTarget, {
            fileId8: fileId ? fileId.slice(0, 8) : null,
          });
        }
      }}
      onPointerUpCapture={(event) => {
        if (isDebugRuntimeEnabled()) {
          traceExcalidrawDragPointer("up", {
            fileId8: fileId ? fileId.slice(0, 8) : null,
            pointerType: event.pointerType,
            source: "wrapper.capture",
          });
        }
        const finishStats =
          finishExcalidrawPointerInteraction("wrapper-pointer-up");
        window.setTimeout(() => {
          traceExcalidrawDragSessionEnd({
            finishReason: "wrapper-pointer-up",
            ...finishStats,
          });
        }, 0);
      }}
      onPointerCancelCapture={() => {
        if (isDebugRuntimeEnabled()) {
          traceExcalidrawDragPointer("up", {
            fileId8: fileId ? fileId.slice(0, 8) : null,
            cancelled: true,
            source: "wrapper.capture",
          });
        }
        const finishStats = finishExcalidrawPointerInteraction(
          "wrapper-pointer-cancel",
        );
        window.setTimeout(() => {
          traceExcalidrawDragSessionEnd({
            finishReason: "wrapper-pointer-cancel",
            ...finishStats,
          });
        }, 0);
      }}
    >
      {shouldMountExcalidrawCanvas ? (
        <ExcalidrawAPIProvider>
          <Excalidraw
            key={file.id}
            initialData={initialData as never}
            name={file.name}
            theme={
              (documentData.appState as { theme?: string } | undefined)
                ?.theme === "dark"
                ? THEME.DARK
                : THEME.LIGHT
            }
            isCollaborating={false}
            viewModeEnabled={!isPaneForeground}
            onExcalidrawAPI={(api) => {
              excalidrawAPIRef.current = api;
              if (hasBrowserViewportRef.current) {
                revealForkCanvasAfterFit(api, () => {}, { skipFit: true });
              }
              if (pendingCachedOpenVerifyRef.current && fileId) {
                pendingCachedOpenVerifyRef.current = false;
                void verifyExcalidrawRemoteAfterCachedOpen({
                  fileId,
                  excalidrawAPI: api,
                });
              }
            }}
            onChange={handleChange}
            onPointerDown={() => {
              if (isDebugRuntimeEnabled()) {
                traceExcalidrawDragStage("core.pointer.down", {
                  fileId8: fileId ? fileId.slice(0, 8) : null,
                  pointerDragActive: isExcalidrawPointerDragActive(),
                });
              }
            }}
            onPointerUp={() => {
              if (isDebugRuntimeEnabled()) {
                traceExcalidrawDragStage("core.pointer.up", {
                  fileId8: fileId ? fileId.slice(0, 8) : null,
                  pointerDragActive: isExcalidrawPointerDragActive(),
                });
              }
            }}
            UIOptions={EXCALIDRAW_UI_OPTIONS}
            handleKeyboardGlobally={isPaneForeground}
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
                    return readStoredFileModificationState(
                      fileId,
                      "excalidraw",
                    );
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
      ) : null}
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
