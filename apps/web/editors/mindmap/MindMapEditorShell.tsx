import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { EditorShellCacheProps } from "../editorShellCacheProps";
import { resolvePaneForeground } from "../editorShellCacheProps";

import { getFileIdFromHash } from "../../data/fileIdFromHash";
import { apiTransport } from "../../data/apiTransport";
import { FileSyncState } from "../../data/FileSyncState";
import {
  isRemoteUpdateTargetSatisfied,
  runRemoteFileApply,
  type RemoteUpdateTarget,
} from "../../data/fileSyncOperationState";
import { CHECKPOINT_LABELS } from "../../data/checkpointPolicy";
import { getAppSettings } from "../../data/appSettings";
import { useIdleAutoSaveRearm } from "../../hooks/useIdleAutoSaveRearm";
import {
  releaseEditorPaneEditPipelineHold,
  retainEditorPaneEditPipelineHold,
  transferEditorPaneEditPipelineHold,
} from "../../shell/editorPaneEditPipeline";
import { useEditorPaneMountGate } from "../../shell/editorPaneLifecycle";
import {
  clearDeferredAutoSave,
  rearmDeferredAutoSave,
} from "../../data/autoSaveSession";
import {
  applyFileModificationState,
  evaluateCurrentFileModificationState,
  readStoredFileModificationState,
} from "../../data/fileModificationState";
import { DEFAULT_DOCUMENT_DISPLAY_NAME } from "../../data/defaultDocumentName";
import { removeRecentFileEntry } from "../../data/recentFiles";
import {
  registerEditorTabDiscardHandler,
  registerEditorTabSaveHandler,
  type ActiveEditorSaveSource,
} from "../../data/activeEditorSaveBridge";
import {
  registerEditorTabSnapshotHandler,
  type ActiveEditorSnapshotSource,
} from "../../data/activeEditorSnapshotBridge";
import { discardLocalDraftSession } from "../../data/discardLocalDraftSession";
import { scheduleSavedFileThumbnailUpload } from "../../data/fileThumbnailPersistence";
import {
  cacheMindMapDraft,
  markDocumentCommitted,
  recordMindMapDraft,
} from "../../data/documentDraftService";
import { updateLocalCacheServerVersionMeta } from "../../data/documentSessionVersionSync";
import {
  cacheDraftThumbnailIfVisible,
} from "../../data/thumbnailLifecycle";
import {
  MindMapAdapter,
  type MindMapDocumentData,
} from "../../data/formats/MindMapAdapter";
import { compactMindMapPersistedConfig } from "../../data/formats/mindMapPersistedConfig";
import { saveMindMapBrowserView } from "../../data/mindMapBrowserViewStorage";
import { hashDocumentSnapshot } from "../../data/sceneHash";
import { createSerializedSaveRunner } from "../../data/serializedSave";

import {
  isServerSyncNotFoundError,
  ServerSync,
  type ServerFile,
} from "../../data/ServerSync";

import { loadEditorServerFile } from "../../data/loadEditorServerFile";
import { isLocalDraftFileId } from "../../data/localDraftFileId";
import {
  EDITOR_HOST_COMMAND_EVENT,
  getEditorHostCommandDetail,
} from "../../shell/editorHostCommand";
import { LocalThumbnailCache } from "../../data/localThumbnailCache";
import {
  readMindMapTraceFileState,
  summarizeMindMapTraceData,
  summarizeMindMapTraceDocument,
  traceMindMapOperation,
} from "../../data/mindMapOperationTrace";
import { persistNativeMindMapThumbnail } from "../../data/mindMapThumbnail";
import type { MindMapSavedThumbnailTarget } from "../../data/mindMapThumbnail";
import { saveNewDocument } from "../../data/saveNewDocument";
import {
  getLocalDraftPresetFolderIdForFile,
  localDraftNeedsSaveFolderPicker,
  shouldSkipLocalDraftFormalSave,
  shouldUseNativeSaveDialogForDraft,
} from "../../data/localDraftSaveFolder";
import { markEditSessionOpened } from "../../data/editSessionService";
import { useRemoteFileRefresh } from "../../hooks/useRemoteFileRefresh";
import { useSaveNewDocumentDialog } from "../../hooks/useSaveNewDocumentDialog";
import { useEditorDocumentTitle } from "../../lib/appBranding";
import {
  logEditorOpenPhase,
  resetEditorOpenPhaseLog,
  type EditorOpenPhase,
} from "../../lib/editorOpenPhases";
import { devDebug } from "../../lib/devDebug";
import { logPerf } from "../../lib/perfLog";
import { traceUserAction } from "../../lib/userTrace";
import { resolveEditorSaveConflict } from "../../shell/editorSaveConflict";
import {
  activateHomeTabWithoutSnapshot,
  openEditorFileTab,
  removeMissingEditorFileTab,
  replaceOpenFileTabAfterSave,
} from "../../shell/editorTabNavigation";

import { ArchivePanel } from "../../components/ArchivePanel";
import { SaveNewDocumentDialog } from "../../components/PromoteTempFileDialog";

import {
  decodeMindMapThumbnailPayload,
  isNativeMindMapThumbnailSvg,
  normalizeMindMapThumbnailSvg,
} from "../../data/thumbnailSvg";

import { resolveMindMapInitialSaveDisplayName } from "./mindMapRootNamePolicy";
import {
  isNativeMindMapMessage,
  type NativeMindMapMessage,
} from "./mindMapBridgeProtocol";
import { createMindMapNativeSaveCoordinator } from "./mindMapNativeSaveCoordinator";
import {
  beginMindMapNativeSavePaneBoost,
  waitForMindMapNativeSavePaneBoost,
} from "./mindMapNativeSavePaneBoost";
import { isAllowedNativeMindMapMessageOrigin } from "./mindMapBridgeOrigins";
import { useMindMapHostBridge } from "./useMindMapHostBridge";
import { useMindMapFileSave } from "./useMindMapFileSave";
import { toNativeMindMapBridgePayload } from "./mindMapBridgePayload";
import {
  resolveMindMapOpenDisplayName,
  useMindMapRootNameSync,
} from "./useMindMapRootNameSync";
import {
  createMindMapBridgeRequestId,
  parseMindMapSavePayload,
  parseMindMapThumbnailPayload,
} from "./mindMapBridge";
import { useMindMapNativeHydrate } from "./useMindMapNativeHydrate";
import { useMindMapDraftTracking } from "./useMindMapDraftTracking";
import {
  shouldFormalizeMindMapLocalDraftSave,
  shouldRequestNativeSnapshotForMindMapLocalDraftAutoSave,
} from "./mindMapLocalDraftSavePolicy";
import {
  isMindMapDirtyStateUserEdit,
  shouldSuppressMindMapDirtyState,
} from "./mindMapDirtyStatePolicy";
import { forwardMindMapHostDebug } from "./mindMapHostDebugForward";
import {
  debugMindMapPersist,
  findFirstRichMindMapNodeSummary,
  summarizeMindMapRichTextTree,
} from "./mindMapPersistDebug";
import { createMindMapHydrateCoordinator } from "./mindMapHydrateCoordinator";
import { recordMindMapPersisted } from "./mindMapPersistCoordinator";
import { canSkipMindMapNativeSyncOnLeave } from "./mindMapLeaveState";
import {
  adoptMindMapNativeBaseline,
  isMindMapNativeDirtyPending,
  shouldSkipMindMapHydrateSettleBaselineAdopt,
} from "./mindMapDraftState";

import "./MindMapEditorShell.scss";

import type { ManagedDocument } from "../../data/documentTypes";

const NATIVE_SAVE_TIMEOUT_MS = 8000;
const MISSING_FILE_REDIRECT_MS = 3000;
function debugMindMapOpen(label: string, data?: Record<string, unknown>) {
  devDebug("mindmap-open", label, data);
  forwardMindMapHostDebug("mindmap-open", label, data);
}

function debugMindMapNative(payload: unknown): void {
  if (!payload || typeof payload !== "object") {
    return;
  }
  const scope =
    typeof (payload as { scope?: unknown }).scope === "string"
      ? (payload as { scope: string }).scope
      : "mindmap-native";
  const label =
    typeof (payload as { label?: unknown }).label === "string"
      ? (payload as { label: string }).label
      : "debug";
  const data =
    (payload as { data?: unknown }).data &&
    typeof (payload as { data?: unknown }).data === "object" &&
    !Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: Record<string, unknown> }).data
      : {};
  devDebug("mindmap-bridge", `native ${scope} ${label}`, {
    nativeScope: scope,
    ...data,
  });
}

function getClipboardRequestId(payload: unknown): string | undefined {
  return payload &&
    typeof payload === "object" &&
    typeof (payload as { requestId?: unknown }).requestId === "string"
    ? (payload as { requestId: string }).requestId
    : undefined;
}

function getClipboardTextPayload(payload: unknown): string {
  return payload &&
    typeof payload === "object" &&
    typeof (payload as { text?: unknown }).text === "string"
    ? (payload as { text: string }).text
    : "";
}

function getClipboardImagePayload(payload: unknown): {
  dataUrl: string;
  type: string;
} | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const dataUrl = (payload as { dataUrl?: unknown }).dataUrl;
  const type = (payload as { type?: unknown }).type;
  if (typeof dataUrl !== "string" || typeof type !== "string") {
    return null;
  }
  return { dataUrl, type };
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return await response.blob();
}

async function readClipboardItemsForNative() {
  if (navigator.clipboard?.read) {
    const items = await navigator.clipboard.read();
    return await Promise.all(
      items.map(async (item) => {
        const entries: Record<string, string> = {};
        await Promise.all(
          item.types.map(async (type) => {
            try {
              const blob = await item.getType(type);
              entries[type] = /^image\//.test(type)
                ? await blobToDataUrl(blob)
                : await blob.text();
            } catch {
              // Browser clipboard items may expose unreadable advertised types.
            }
          }),
        );
        return {
          types: item.types,
          entries,
        };
      }),
    );
  }
  if (navigator.clipboard?.readText) {
    const text = await navigator.clipboard.readText();
    return text
      ? [
          {
            types: ["text/plain"],
            entries: { "text/plain": text },
          },
        ]
      : [];
  }
  throw new Error("当前浏览器不支持读取剪贴板");
}

type MindMapPublishOptions = {
  preserveViewport?: boolean;
};

async function shouldRefreshMindMapServerThumbnail(
  fileId: string,
  opts: { hasThumbnail?: boolean; contentSha?: string | null },
): Promise<boolean> {
  if (!opts.hasThumbnail) {
    return true;
  }
  const cached = LocalThumbnailCache.getForContent(fileId, opts.contentSha);
  if (cached && isNativeMindMapThumbnailSvg(cached)) {
    return false;
  }
  try {
    const thumbPath = `/api/files/${fileId}/thumbnail${
      opts.contentSha ? `?h=${encodeURIComponent(opts.contentSha)}` : ""
    }`;
    const response = await apiTransport.request({
      method: "GET",
      path: thumbPath,
      headers: {
        Accept: "image/svg+xml,text/plain,*/*;q=0.8",
        "Cache-Control": opts.contentSha ? "max-age=31536000" : "no-store",
      },
    });
    if (response.status === 404) {
      return true;
    }
    if (response.status < 200 || response.status >= 300) {
      return false;
    }
    return !isNativeMindMapThumbnailSvg(response.bodyText);
  } catch {
    return false;
  }
}

export default function MindMapEditorShell(props: EditorShellCacheProps = {}) {
  const isPaneForeground = resolvePaneForeground(props);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const shellRootRef = useRef<HTMLDivElement | null>(null);
  const mountNativeFrame = useEditorPaneMountGate(isPaneForeground);
  const pinnedFileId = props.pinnedFileId;
  const [file, setFile] = useState<ServerFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [archiveSaving, setArchiveSaving] = useState(false);
  const fileId = props.pinnedFileId ?? getFileIdFromHash();

  const baselineHashRef = useRef<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const releaseAutoSavePipelineRef = useRef<(() => void) | null>(null);
  const releaseNativeSavePipelineRef = useRef<(() => void) | null>(null);
  const missingFileRedirectTimerRef = useRef<number | null>(null);
  const enqueueSaveRef = useRef(createSerializedSaveRunner<boolean>());
  const pendingNativeSnapshotRef = useRef<Map<string, (ok: boolean) => void>>(
    new Map(),
  );
  const pendingNativeSaveSourceRef = useRef<
    Map<string, ActiveEditorSaveSource>
  >(new Map());
  const pendingNativeSnapshotSourceRef = useRef<
    Map<string, ActiveEditorSnapshotSource>
  >(new Map());
  const latestMindMapDataRef = useRef<MindMapDocumentData | null>(null);
  const latestDocumentRef = useRef<ManagedDocument<MindMapDocumentData> | null>(
    null,
  );
  const latestDataRevisionRef = useRef(0);
  const latestNativeRevisionRef = useRef(0);
  const nativeThumbnailSaveInFlightRef = useRef(false);
  const lastSavedThumbnailTargetRef =
    useRef<MindMapSavedThumbnailTarget | null>(null);
  const needsInitialThumbnailRef = useRef(false);
  const initialThumbnailGateRef = useRef({
    needsRefresh: false,
  });
  const [nativeHydrateSettled, setNativeHydrateSettled] = useState(false);
  const [initialThumbnailRequestTick, setInitialThumbnailRequestTick] =
    useState(0);
  const deferredMindMapAutoSaveRef = useRef(false);
  const hydrateCoordinatorRef = useRef(createMindMapHydrateCoordinator());
  const pendingNativeSaveRequestIdRef = useRef<string | null>(null);
  const pendingNativeSnapshotRequestIdRef = useRef<string | null>(null);
  const requestNativeSaveRef = useRef<
    ((source?: ActiveEditorSaveSource) => Promise<boolean>) | null
  >(null);
  const queueAutoSaveRef = useRef<
    ((
      mindMapData: MindMapDocumentData,
      thumbnail?: string | null,
      requestId?: string | null,
    ) => void) | null
  >(null);
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
    getDocumentKind: () => "mindmap",
    getDefaultName: () =>
      resolveMindMapInitialSaveDisplayName(
        latestMindMapDataRef.current ??
          MindMapAdapter.createEmpty(file?.name),
        file?.name,
      ),
    getMindMapDocument: () => latestDocumentRef.current,
    getMindMapThumbnail: () =>
      fileId ? LocalThumbnailCache.get(fileId) ?? null : null,
    navigateHome: () => {
      activateHomeTabWithoutSnapshot();
    },
    setErrorMessage: setStatusMessage,
  });

  const logMindMapOpenPhase = useCallback(
    (phase: EditorOpenPhase) => {
      logEditorOpenPhase(phase, {
        editor: "mindmap",
        fileId8: fileId?.slice(0, 8) ?? null,
      });
    },
    [fileId],
  );

  const { markDocumentChanged, markNativeDocumentDirty, flushDraft } =
    useMindMapDraftTracking(fileId, { allowInactiveFile: !!pinnedFileId });

  const noteOpenHydrateSession = useCallback(
    (document: ManagedDocument<MindMapDocumentData>) => {
      const session = hydrateCoordinatorRef.current.beginSession(document);
      latestDocumentRef.current = document;
      debugMindMapPersist("[DEBUG] open hydrate session anchored", {
        fileId8: fileId?.slice(0, 8) ?? null,
        contentHash8: session.anchor.contentHash.slice(0, 8),
        richText: session.anchor.richText,
      });
    },
    [fileId],
  );

  const flushDeferredMindMapAutoSave = useCallback(
    (reason: string) => {
      if (!deferredMindMapAutoSaveRef.current) {
        return;
      }
      deferredMindMapAutoSaveRef.current = false;
      traceMindMapOperation("host.deferredAutoSave.rearm", {
        fileId8: fileId?.slice(0, 8) ?? null,
        reason,
      });
      void requestNativeSaveRef.current?.("auto");
    },
    [fileId],
  );

  const deferMindMapAutoSave = useCallback(
    (reason: string) => {
      deferredMindMapAutoSaveRef.current = true;
      traceMindMapOperation("host.deferredAutoSave.mark", {
        fileId8: fileId?.slice(0, 8) ?? null,
        reason,
        fileState: readMindMapTraceFileState(fileId),
      });
    },
    [fileId],
  );

  const finishMindMapAutoSaveRequest = useCallback(
    (ok: boolean, reason: string) => {
      if (ok) {
        deferredMindMapAutoSaveRef.current = false;
        return;
      }
      deferMindMapAutoSave(reason);
      const pendingData =
        latestMindMapDataRef.current ??
        latestDocumentRef.current?.data ??
        null;
      if (pendingData) {
        queueAutoSaveRef.current?.(pendingData);
      }
    },
    [deferMindMapAutoSave],
  );

  const flushMindMapAutoSaveWhenInactive = useCallback(
    (reason: string) => {
      flushDraft();
      if (!fileId || !FileSyncState.hasUnsavedChanges(fileId)) {
        return;
      }
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      traceMindMapOperation("host.autoSave.flushWhenInactive", {
        fileId8: fileId.slice(0, 8),
        reason,
        fileState: readMindMapTraceFileState(fileId),
      });
      void requestNativeSaveRef.current?.("auto").then((ok) => {
        finishMindMapAutoSaveRequest(ok, reason);
      });
    },
    [fileId, finishMindMapAutoSaveRequest, flushDraft],
  );

  const onNativeHydrateSettleEnd = useCallback(() => {
    const latest = latestDocumentRef.current;
    if (!latest || !fileId) {
      return;
    }
    const baselineDocument = hydrateCoordinatorRef.current.settle(latest);
    latestDocumentRef.current = baselineDocument;
    const skipAdopt = shouldSkipMindMapHydrateSettleBaselineAdopt(
      fileId,
      baselineDocument,
    );
    traceMindMapOperation("host.hydrateSettleEnd", {
      fileId8: fileId.slice(0, 8),
      skipAdopt,
      hasUnsavedChanges: FileSyncState.hasUnsavedChanges(fileId),
      nativeDirtyPending: isMindMapNativeDirtyPending(fileId),
      settledDocument: summarizeMindMapTraceDocument(baselineDocument),
      fileStateBeforeAdopt: readMindMapTraceFileState(fileId),
    });
    if (skipAdopt) {
      if (rearmDeferredAutoSave()) {
        debugMindMapPersist("auto save rearmed after hydrate", {
          fileId8: fileId.slice(0, 8),
          source: "auto",
        });
      }
      flushDeferredMindMapAutoSave("skip-adopt");
      traceMindMapOperation("host.hydrateSettleEnd.skipAdoptBaseline", {
        fileId8: fileId.slice(0, 8),
        reason: FileSyncState.hasUnsavedChanges(fileId)
          ? "unsaved-changes"
          : isMindMapNativeDirtyPending(fileId)
          ? "native-dirty-pending"
          : "local-draft",
        fileStateAfterSkip: readMindMapTraceFileState(fileId),
      });
      debugMindMapPersist("[DEBUG] hydrate settle skipped baseline adopt", {
        fileId8: fileId.slice(0, 8),
        hasUnsavedChanges: FileSyncState.hasUnsavedChanges(fileId),
        nativeDirtyPending: isMindMapNativeDirtyPending(fileId),
      });
      return;
    }
    clearDeferredAutoSave();
    if (deferredMindMapAutoSaveRef.current) {
      flushDeferredMindMapAutoSave("adopt-baseline");
    } else {
      deferredMindMapAutoSaveRef.current = false;
    }
    adoptMindMapNativeBaseline(fileId, baselineDocument);
    traceMindMapOperation("host.hydrateSettleEnd.adoptBaselineAfter", {
      fileId8: fileId.slice(0, 8),
      settledDocument: summarizeMindMapTraceDocument(baselineDocument),
      fileStateAfterAdopt: readMindMapTraceFileState(fileId),
    });
    debugMindMapPersist("[DEBUG] native hydrate settle aligned", {
      fileId8: fileId.slice(0, 8),
      contentHash8: hashDocumentSnapshot(baselineDocument).slice(0, 8),
      sampleNode: findFirstRichMindMapNodeSummary(baselineDocument.data),
    });
  }, [fileId, flushDeferredMindMapAutoSave]);

  const {
    isHydratingRef: nativeHydratingRef,
    extendSettle: extendNativeHydrateSettle,
    dispose: disposeNativeHydrate,
  } = useMindMapNativeHydrate({
    onSettleEnd: onNativeHydrateSettleEnd,
    onSettleExtended: (reason) => {
      debugMindMapOpen("native hydrate settle extended", { reason });
    },
    onSettleComplete: (reason) => {
      traceMindMapOperation("host.hydrateSettleComplete", {
        fileId8: fileId?.slice(0, 8) ?? null,
        reason,
        fileState: readMindMapTraceFileState(fileId),
      });
      debugMindMapOpen("native hydrate settle end", { reason });
      setNativeHydrateSettled(true);
    },
  });

  const debugOpen = useCallback(
    (label: string, data?: Record<string, unknown>) => {
      debugMindMapOpen(label, data);
    },
    [],
  );

  const onTabForegroundRef = useRef<() => void>(() => {});

  const {
    bootKey,
    bridgePhase,
    bridgeSnapshot,
    bridgeError,
    isNativeReady,
    isAppReady,
    isBridgeReady,
    publishDocument,
    postToNative,
    onIframeLoad,
    onIframeError,
    handleBridgeLifecycleMessage,
    isMessageFromCurrentIframe,
    learnedOrigin,
  } = useMindMapHostBridge({
    fileId,
    iframeRef,
    sessionEnabled: mountNativeFrame,
    isPaneForeground,
    onPaneForeground: () => onTabForegroundRef.current(),
    onPaneBackground: () => flushMindMapAutoSaveWhenInactive("pane-background"),
    debugOpen,
  });

  const nativeSaveContextRef = useRef({
    fileId,
    bridgePhase,
    bridgeSnapshot,
    isAppReady,
    isBridgeReady,
  });
  nativeSaveContextRef.current = {
    fileId,
    bridgePhase,
    bridgeSnapshot,
    isAppReady,
    isBridgeReady,
  };
  const nativeSaveCoordinatorRef = useRef(
    createMindMapNativeSaveCoordinator({
      getBridgeContext: () => {
        const ctx = nativeSaveContextRef.current;
        return {
          bridgeReady: ctx.isBridgeReady,
          appInited: ctx.isAppReady,
          bridgePhase: ctx.bridgePhase,
          fileId8: ctx.fileId?.slice(0, 8) ?? null,
          bridgeState: {
            ...ctx.bridgeSnapshot,
            fileId8: ctx.fileId?.slice(0, 8) ?? null,
          },
        };
      },
      postSaveRequest: (requestId) =>
        postToNative("requestMindMapSave", { requestId }),
      onError: setError,
      onRequestStart: (requestId, source) => {
        pendingNativeSaveRequestIdRef.current = requestId;
        pendingNativeSaveSourceRef.current.set(
          requestId,
          (source as ActiveEditorSaveSource | undefined) ?? "manual",
        );
      },
    }),
  );

  useEffect(() => {
    return () => {
      nativeSaveCoordinatorRef.current.dispose();
    };
  }, []);

  const postClipboardResult = useCallback(
    (type: string, requestId: string | undefined, payload: unknown) => {
      postToNative(type, {
        requestId,
        ...((payload && typeof payload === "object" ? payload : {}) as Record<
          string,
          unknown
        >),
      });
    },
    [postToNative],
  );

  const handleNativeClipboardMessage = useCallback(
    async (message: NativeMindMapMessage): Promise<boolean> => {
      const requestId = getClipboardRequestId(message.payload);
      try {
        if (message.type === "CLIPBOARD_WRITE_TEXT") {
          if (!navigator.clipboard?.writeText) {
            throw new Error("当前浏览器不支持写入剪贴板");
          }
          await navigator.clipboard.writeText(
            getClipboardTextPayload(message.payload),
          );
          postClipboardResult("CLIPBOARD_RESULT", requestId, { ok: true });
          return true;
        }

        if (message.type === "CLIPBOARD_READ_TEXT") {
          if (!navigator.clipboard?.readText) {
            throw new Error("当前浏览器不支持读取文本剪贴板");
          }
          const text = await navigator.clipboard.readText();
          postClipboardResult("CLIPBOARD_READ_RESULT", requestId, {
            ok: true,
            text,
          });
          return true;
        }

        if (message.type === "CLIPBOARD_READ") {
          debugMindMapOpen("CLIPBOARD_READ start", {
            requestId,
            hasClipboardRead: !!navigator.clipboard?.read,
            hasClipboardReadText: !!navigator.clipboard?.readText,
            documentHasFocus: document.hasFocus(),
          });
          const items = await readClipboardItemsForNative();
          debugMindMapOpen("CLIPBOARD_READ done", {
            requestId,
            itemCount: items.length,
            itemTypes: items.map((item) => item.types),
          });
          postClipboardResult("CLIPBOARD_READ_ITEMS_RESULT", requestId, {
            ok: true,
            items,
          });
          return true;
        }

        if (message.type === "CLIPBOARD_WRITE_IMAGE") {
          const image = getClipboardImagePayload(message.payload);
          const ClipboardItemCtor = window.ClipboardItem;
          if (!image || !navigator.clipboard?.write || !ClipboardItemCtor) {
            throw new Error("当前浏览器不支持写入图片剪贴板");
          }
          const blob = await dataUrlToBlob(image.dataUrl);
          await navigator.clipboard.write([
            new ClipboardItemCtor({ [image.type]: blob }),
          ]);
          postClipboardResult("CLIPBOARD_RESULT", requestId, { ok: true });
          return true;
        }
      } catch (err: any) {
        debugMindMapOpen("clipboard bridge failed", {
          type: message.type,
          requestId,
          name: err?.name,
          message: err?.message,
        });
        const resultType =
          message.type === "CLIPBOARD_READ"
            ? "CLIPBOARD_READ_ITEMS_RESULT"
            : message.type === "CLIPBOARD_READ_TEXT"
            ? "CLIPBOARD_READ_RESULT"
            : "CLIPBOARD_RESULT";
        postClipboardResult(resultType, requestId, {
          ok: false,
          error: err?.message || "剪贴板操作失败",
        });
        return true;
      }
      return false;
    },
    [postClipboardResult],
  );

  const setFileName = useCallback((name: string) => {
    const nextName = String(name || "").trim() || DEFAULT_DOCUMENT_DISPLAY_NAME;
    setFile((current) => (current ? { ...current, name: nextName } : current));
  }, []);

  const {
    initSyncedText,
    onDocumentChanged: syncRootTextToFileName,
    syncFileNameToRootIfNeeded,
  } = useMindMapRootNameSync({
    fileId,
    setFileName,
    isBridgeReady: isNativeReady,
    postToNative,
  });

  useEditorDocumentTitle(file?.name);

  const publishMindMapDocument = useCallback(
    (
      data: MindMapDocumentData,
      reason: string,
      opts?: MindMapPublishOptions,
    ) => {
      extendNativeHydrateSettle(`publish:${reason}`);
      const document =
        latestDocumentRef.current ?? MindMapAdapter.toDocument(data);
      noteOpenHydrateSession(document);
      debugMindMapPersist("[DEBUG] publishMindMapDataToNative", {
        reason,
        fileId8: fileId?.slice(0, 8) ?? null,
        rootChildren: data.root?.children?.length ?? 0,
        sampleNode: findFirstRichMindMapNodeSummary(data),
      });
      publishDocument(
        toNativeMindMapBridgePayload(data, fileId, {
          applyBrowserView: !opts?.preserveViewport,
        }),
        reason,
      );
    },
    [
      extendNativeHydrateSettle,
      fileId,
      noteOpenHydrateSession,
      publishDocument,
    ],
  );

  useEffect(() => {
    onTabForegroundRef.current = () => {
      flushDeferredMindMapAutoSave("pane-foreground");
      if (!file || isAppReady) {
        return;
      }
      const document = latestDocumentRef.current;
      if (!document) {
        return;
      }
      publishMindMapDocument(document.data, "tab-foreground", {
        preserveViewport: true,
      });
    };
  }, [file, flushDeferredMindMapAutoSave, isAppReady, publishMindMapDocument]);

  const baselineHash = useMemo(() => {
    if (!file) {
      return null;
    }
    try {
      const document = MindMapAdapter.toDocument(
        MindMapAdapter.parse(file.data),
      );
      return hashDocumentSnapshot(document);
    } catch {
      return null;
    }
  }, [file]);

  useEffect(() => {
    baselineHashRef.current = baselineHash;
  }, [baselineHash]);

  const saveMindMapFile = useMindMapFileSave(fileId, baselineHash);

  const handleMissingServerFile = useCallback((missingFileId: string) => {
    FileSyncState.clearLocalCache(missingFileId);
    FileSyncState.clearHashStateForFile(missingFileId);
    FileSyncState.clearLocalEditTime(missingFileId);
    LocalThumbnailCache.clear(missingFileId);
    removeRecentFileEntry(missingFileId);
    removeMissingEditorFileTab(missingFileId);
    window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
    window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
    setFile(null);
    setStatusMessage(null);
    setError("该文件不存在或已被删除，稍后返回文件列表。");

    if (missingFileRedirectTimerRef.current !== null) {
      window.clearTimeout(missingFileRedirectTimerRef.current);
    }
    missingFileRedirectTimerRef.current = window.setTimeout(() => {
      missingFileRedirectTimerRef.current = null;
      activateHomeTabWithoutSnapshot();
      window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
    }, MISSING_FILE_REDIRECT_MS);
  }, []);

  const reloadFromServer = useCallback(
    async (opts?: {
      preserveViewport?: boolean;
      target?: RemoteUpdateTarget;
    }) => {
      if (!fileId) {
        return;
      }
      try {
        await runRemoteFileApply(fileId, async () => {
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
          setError(null);
          const document = MindMapAdapter.toDocument(
            MindMapAdapter.parse(next.data),
          );
          setFile({
            ...next,
            name: resolveMindMapOpenDisplayName(document.data, next.name || null),
          });
          syncFileNameToRootIfNeeded(
            next.name || DEFAULT_DOCUMENT_DISPLAY_NAME,
            document.data,
          );
          initSyncedText(document.data);
          latestDocumentRef.current = document;
          latestMindMapDataRef.current = document.data;
          baselineHashRef.current = hashDocumentSnapshot(document);
          cacheMindMapDraft(fileId, document);
          updateLocalCacheServerVersionMeta(
            fileId,
            {
              content_sha256: next.content_sha256 ?? null,
              version: next.version ?? null,
            },
            "mindmap-reload",
          );
          markDocumentCommitted(fileId, baselineHashRef.current);
          const needsInitialThumbnail =
            await shouldRefreshMindMapServerThumbnail(fileId, {
              hasThumbnail: next.has_thumbnail,
              contentSha: next.content_sha256,
            });
          needsInitialThumbnailRef.current = needsInitialThumbnail;
          initialThumbnailGateRef.current.needsRefresh = needsInitialThumbnail;
          if (needsInitialThumbnail) {
            setInitialThumbnailRequestTick((tick) => tick + 1);
          }
          publishMindMapDocument(document.data, "server-reload", {
            preserveViewport: !!opts?.preserveViewport,
          });
        });
      } catch (error) {
        if (isServerSyncNotFoundError(error)) {
          handleMissingServerFile(fileId);
          return;
        }
        throw error;
      }
    },
    [
      fileId,
      handleMissingServerFile,
      initSyncedText,
      publishMindMapDocument,
      syncFileNameToRootIfNeeded,
    ],
  );

  const reloadFromCrossTabSave = useCallback(
    (target?: RemoteUpdateTarget) =>
      reloadFromServer({
        preserveViewport: true,
        target,
      }),
    [reloadFromServer],
  );

  useRemoteFileRefresh({
    fileId,
    getDocumentName: () => file?.name ?? DEFAULT_DOCUMENT_DISPLAY_NAME,
    reload: reloadFromCrossTabSave,
    onReloaded: () => {
      setStatusMessage("已同步远端更新");
    },
  });

  useEffect(() => {
    if (!fileId) {
      return;
    }
    markEditSessionOpened(fileId);
  }, [fileId]);

  useEffect(() => {
    let cancelled = false;
    if (!fileId) {
      setFile(null);
      return;
    }
    resetEditorOpenPhaseLog();
    hydrateCoordinatorRef.current.reset();
    logMindMapOpenPhase("resolving");
    debugMindMapOpen("load file | start", {
      fileId8: fileId.slice(0, 20),
    });
    const preferLocalRecovery = FileSyncState.hasUnsavedChanges(fileId);
    const openForce =
      isLocalDraftFileId(fileId) ? false : !preferLocalRecovery;
    loadEditorServerFile(fileId, { force: openForce })
      .then(async (next) => {
        if (!cancelled) {
          debugMindMapOpen("load file | ok", {
            fileId8: fileId.slice(0, 20),
            kind: next.kind ?? null,
            preferLocalRecovery,
          });
          setError(null);
          const document = MindMapAdapter.toDocument(
            MindMapAdapter.parse(next.data),
          );
          setFile({
            ...next,
            name: resolveMindMapOpenDisplayName(
              document.data,
              next.name || null,
            ),
          });
          syncFileNameToRootIfNeeded(
            next.name || DEFAULT_DOCUMENT_DISPLAY_NAME,
            document.data,
          );
          initSyncedText(document.data);
          latestDocumentRef.current = document;
          latestMindMapDataRef.current = document.data;
          const hash = hashDocumentSnapshot(document);
          baselineHashRef.current = hash;
          if (next.content_sha256) {
            FileSyncState.setServerHash(next.id, next.content_sha256);
          }
          needsInitialThumbnailRef.current =
            await shouldRefreshMindMapServerThumbnail(next.id, {
              hasThumbnail: next.has_thumbnail,
              contentSha: next.content_sha256,
            });
          initialThumbnailGateRef.current.needsRefresh =
            needsInitialThumbnailRef.current;
          if (needsInitialThumbnailRef.current) {
            setInitialThumbnailRequestTick((tick) => tick + 1);
          }
          if (cancelled) {
            return;
          }
          if (preferLocalRecovery) {
            FileSyncState.setDraftHash(fileId, hash);
            logMindMapOpenPhase("restoring_draft");
          } else {
            markDocumentCommitted(next.id, hash);
          }
          cacheMindMapDraft(next.id, document);
          updateLocalCacheServerVersionMeta(
            next.id,
            {
              content_sha256: next.content_sha256 ?? null,
              version: next.version ?? null,
            },
            "mindmap-open",
          );
          noteOpenHydrateSession(document);
          debugMindMapPersist("[DEBUG] load file | hash state", {
            fileId8: fileId.slice(0, 8),
            preferLocalRecovery,
            contentHash8: hash.slice(0, 8),
            baselineHash8:
              FileSyncState.getBaselineHash(fileId)?.slice(0, 8) ?? null,
            draftHash8: FileSyncState.getDraftHash(fileId)?.slice(0, 8) ?? null,
            syncState: FileSyncState.getSyncState(fileId),
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          if (isServerSyncNotFoundError(err)) {
            debugMindMapOpen("load file | missing server file", {
              fileId8: fileId.slice(0, 20),
              message: err instanceof Error ? err.message : String(err),
            });
            handleMissingServerFile(fileId);
            return;
          }
          const message = err instanceof Error ? err.message : String(err);
          debugMindMapOpen("load file | failed", {
            fileId8: fileId.slice(0, 20),
            message,
          });
          setError(message);
        }
      });
    return () => {
      cancelled = true;
      if (missingFileRedirectTimerRef.current !== null) {
        window.clearTimeout(missingFileRedirectTimerRef.current);
        missingFileRedirectTimerRef.current = null;
      }
      disposeNativeHydrate();
    };
  }, [
    disposeNativeHydrate,
    fileId,
    handleMissingServerFile,
    initSyncedText,
    logMindMapOpenPhase,
    noteOpenHydrateSession,
    syncFileNameToRootIfNeeded,
  ]);

  useEffect(() => {
    if (!file) {
      return;
    }
    try {
      const document = MindMapAdapter.toDocument(
        MindMapAdapter.parse(file.data),
      );
      latestDocumentRef.current = document;
      latestMindMapDataRef.current = document.data;
      publishMindMapDocument(document.data, "file-loaded");
    } catch {
      const fallback = MindMapAdapter.toDocument(
        MindMapAdapter.createEmpty(file.name),
      );
      latestDocumentRef.current = fallback;
      latestMindMapDataRef.current = fallback.data;
      publishMindMapDocument(fallback.data, "file-loaded-fallback");
    }
  }, [file, publishMindMapDocument]);

  const persistMindMapDocumentInner = useCallback(
    async (
      mindMapData: MindMapDocumentData,
      source: ActiveEditorSaveSource,
      thumbnail?: string | null,
      requestId?: string | null,
      opts?: { forceOverwrite?: boolean; resolvingConflict?: boolean },
    ) => {
      if (!fileId) {
        return false;
      }
      try {
        flushDraft();
        const document = MindMapAdapter.toDocument(mindMapData);
        traceMindMapOperation("host.persistMindMapDocument.start", {
          fileId8: fileId.slice(0, 8),
          source,
          requestId: requestId ?? null,
          hasThumbnail: typeof thumbnail === "string" && thumbnail.length > 0,
          document: summarizeMindMapTraceDocument(document),
          fileStateBefore: readMindMapTraceFileState(fileId),
        });
        const hash = recordMindMapDraft(fileId, document);
        // 编辑器内只接受 native 导出的 SVG；无 thumbnail 时不覆盖服务端已有缩略图
        let resolvedThumbnail: string | undefined;
        if (typeof thumbnail === "string" && thumbnail.length > 0) {
          resolvedThumbnail = normalizeMindMapThumbnailSvg(thumbnail, {
            source: "native",
          });
          cacheDraftThumbnailIfVisible(
            fileId,
            "mindmap",
            resolvedThumbnail,
            hash,
          );
        }
        if (isLocalDraftFileId(fileId)) {
          const shouldFormalizeLocalDraft =
            shouldFormalizeMindMapLocalDraftSave(source, !!requestId);
          if (!shouldFormalizeLocalDraft) {
            traceMindMapOperation(
              "host.persistMindMapDocument.localDraft.skipFormalize",
              {
                fileId8: fileId.slice(0, 8),
                source,
                requestId: requestId ?? null,
                hash,
                fileStateAfterDraft: readMindMapTraceFileState(fileId),
              },
            );
            if (requestId) {
              postToNative("mindMapHostSaveStatus", {
                requestId,
                ok: true,
                error: null,
              });
            }
            return true;
          }
          if (shouldSkipLocalDraftFormalSave(source, file?.folder_id)) {
            traceMindMapOperation(
              "host.persistMindMapDocument.localDraft.skipMissingFolder",
              {
                fileId8: fileId.slice(0, 8),
                source,
                requestId: requestId ?? null,
              },
            );
            if (requestId) {
              postToNative("mindMapHostSaveStatus", {
                requestId,
                ok: true,
                error: null,
              });
            }
            return true;
          }
          if (
            shouldUseNativeSaveDialogForDraft(fileId) ||
            localDraftNeedsSaveFolderPicker(file?.folder_id)
          ) {
            openSaveDialog(false);
            return false;
          }
          const title = resolveMindMapInitialSaveDisplayName(
            document.data,
            file?.name,
          );
          const saved = await saveNewDocument({
            kind: "mindmap",
            name: title,
            folderId: getLocalDraftPresetFolderIdForFile(
              fileId,
              file?.folder_id,
            )!,
            draftId: fileId,
            mindMapDocument: document,
            mindMapThumbnail: resolvedThumbnail ?? null,
          });
          const formalizedServerSha =
            FileSyncState.getServerHash(saved.id) ??
            FileSyncState.getBaselineHash(saved.id);
          recordMindMapPersisted(
            saved.id,
            document,
            formalizedServerSha
              ? { serverContentSha256: formalizedServerSha }
              : undefined,
          );
          baselineHashRef.current = hash;
          window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
          traceMindMapOperation(
            "host.persistMindMapDocument.localDraft.formalized.syncState",
            {
              newFileId8: saved.id.slice(0, 8),
              hash,
              fileStateAfterPersist: readMindMapTraceFileState(saved.id),
            },
          );
          replaceOpenFileTabAfterSave({
            fromFileId: fileId,
            toFileId: saved.id,
            kind: saved.kind,
            title: saved.name,
          });
          void openEditorFileTab(
            {
              fileId: saved.id,
              kind: saved.kind,
              title: saved.name,
            },
            { getCurrentFileId: () => null },
          );
          if (requestId) {
            postToNative("mindMapHostSaveStatus", {
              requestId,
              ok: true,
              error: null,
            });
          }
          traceMindMapOperation(
            "host.persistMindMapDocument.localDraft.formalized",
            {
              oldFileId8: fileId.slice(0, 8),
              newFileId8: saved.id.slice(0, 8),
              source,
              requestId: requestId ?? null,
              hash,
              requestedName: title,
              savedName: saved.name,
            },
          );
          return true;
        }
        const result = await saveMindMapFile(
          document,
          source,
          undefined,
          resolvedThumbnail,
          { forceOverwrite: opts?.forceOverwrite },
        );
        if (result?.content_sha256 || result?.skipped) {
          baselineHashRef.current = hash;
          recordMindMapPersisted(
            fileId,
            document,
            result.content_sha256
              ? { serverContentSha256: result.content_sha256 }
              : undefined,
          );
          if (result.content_sha256) {
            const thumbnailSource =
              source === "manual"
                ? "sidebar"
                : source === "exit"
                  ? "home"
                  : source;
            const thumbnailTarget = {
              fileId,
              kind: "mindmap",
              name: file?.name ?? DEFAULT_DOCUMENT_DISPLAY_NAME,
              contentSha: result.content_sha256,
              documentHash: hash,
              version: result.version ?? null,
              updatedAt: result.updated_at ?? null,
              source: thumbnailSource,
            } satisfies MindMapSavedThumbnailTarget;
            lastSavedThumbnailTargetRef.current = thumbnailTarget;
            scheduleSavedFileThumbnailUpload({
              ...thumbnailTarget,
              thumbnail: resolvedThumbnail,
            });
            if (resolvedThumbnail) {
              initialThumbnailGateRef.current.needsRefresh = false;
              needsInitialThumbnailRef.current = false;
            }
          }
        }
        if (!result?.skipped) {
          window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
        }
        traceMindMapOperation("host.persistMindMapDocument.server.after", {
          fileId8: fileId.slice(0, 8),
          source,
          requestId: requestId ?? null,
          ok: !!result,
          skipped: !!result?.skipped,
          serverContentSha256: result?.content_sha256 ?? null,
          hash,
          fileStateAfter: readMindMapTraceFileState(fileId),
        });
        traceUserAction(
          "mindmap-save",
          "persistServer",
          {
            fileId8: fileId.slice(0, 8),
            source,
            requestId: requestId ?? null,
            ok: !!result,
            skipped: !!result?.skipped,
            serverSha8: result?.content_sha256?.slice(0, 8) ?? null,
            version: result?.version ?? null,
          },
          result ? "ok" : "fail",
        );
        if (requestId) {
          postToNative("mindMapHostSaveStatus", {
            requestId,
            ok: true,
            error: null,
          });
        }
        return true;
      } catch (err) {
        if (!opts?.resolvingConflict) {
          const conflictResult = await resolveEditorSaveConflict(err, {
            documentName: file?.name ?? null,
            loadRemote: reloadFromServer,
            forceOverwrite: () =>
              persistMindMapDocumentInner(
                mindMapData,
                source,
                thumbnail,
                requestId,
                { forceOverwrite: true, resolvingConflict: true },
              ),
          });
          if (conflictResult.handled) {
            if (requestId && conflictResult.action !== "force-overwrite") {
              postToNative("mindMapHostSaveStatus", {
                requestId,
                ok: conflictResult.saved,
                error: conflictResult.saved ? null : "save conflict cancelled",
              });
            }
            return conflictResult.saved;
          }
        }
        const message = err instanceof Error ? err.message : String(err);
        traceMindMapOperation("host.persistMindMapDocument.fail", {
          fileId8: fileId.slice(0, 8),
          source,
          requestId: requestId ?? null,
          message,
          fileStateAfterError: readMindMapTraceFileState(fileId),
        });
        setStatusMessage(message);
        if (requestId) {
          postToNative("mindMapHostSaveStatus", {
            requestId,
            ok: false,
            error: message,
          });
        }
        return false;
      }
    },
    [
      file?.folder_id,
      file?.name,
      fileId,
      flushDraft,
      openSaveDialog,
      postToNative,
      reloadFromServer,
      saveMindMapFile,
    ],
  );

  const persistMindMapDocument = useCallback(
    (
      mindMapData: MindMapDocumentData,
      source: ActiveEditorSaveSource,
      thumbnail?: string | null,
      requestId?: string | null,
    ) =>
      enqueueSaveRef.current(() =>
        persistMindMapDocumentInner(mindMapData, source, thumbnail, requestId),
      ),
    [persistMindMapDocumentInner],
  );

  const queueAutoSave = useCallback(
    (
      mindMapData: MindMapDocumentData,
      thumbnail?: string | null,
      requestId?: string | null,
    ) => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      releaseEditorPaneEditPipelineHold(releaseAutoSavePipelineRef);
      const saveSource = requestId
        ? pendingNativeSaveSourceRef.current.get(requestId) ?? "manual"
        : "auto";
      const settings = getAppSettings();
      traceMindMapOperation("host.queueAutoSave.requested", {
        fileId8: fileId?.slice(0, 8) ?? null,
        saveSource,
        requestId: requestId ?? null,
        autoSaveEnabled: settings.autoSaveEnabled,
        autoSaveIdleSec: settings.autoSaveIdleSec,
        hasThumbnail: typeof thumbnail === "string" && thumbnail.length > 0,
        data: summarizeMindMapTraceData(mindMapData),
        fileStateAtQueue: readMindMapTraceFileState(fileId),
      });
      traceUserAction(
        "mindmap-save",
        "queueAutoSave",
        {
          fileId8: fileId?.slice(0, 8) ?? null,
          saveSource,
          requestId: requestId ?? null,
          autoSaveEnabled: settings.autoSaveEnabled,
          autoSaveIdleSec: settings.autoSaveIdleSec,
          hasThumbnail: typeof thumbnail === "string" && thumbnail.length > 0,
          nodeCount: summarizeMindMapTraceData(mindMapData)?.nodeCount ?? null,
        },
        "start",
      );
      if (
        !requestId &&
        (!settings.autoSaveEnabled || settings.autoSaveIdleSec <= 0)
      ) {
        saveTimerRef.current = null;
        traceMindMapOperation("host.queueAutoSave.skippedBySettings", {
          fileId8: fileId?.slice(0, 8) ?? null,
          saveSource,
          autoSaveEnabled: settings.autoSaveEnabled,
          autoSaveIdleSec: settings.autoSaveIdleSec,
          fileStateAtSkip: readMindMapTraceFileState(fileId),
        });
        return;
      }
      if (nativeHydratingRef.current) {
        if (saveSource === "thumbnail") {
          initialThumbnailGateRef.current.needsRefresh = true;
        } else if (!requestId) {
          deferredMindMapAutoSaveRef.current = true;
        }
        traceMindMapOperation("host.queueAutoSave.deferredDuringHydrate", {
          fileId8: fileId?.slice(0, 8) ?? null,
          saveSource,
          requestId: requestId ?? null,
          fileStateAtDefer: readMindMapTraceFileState(fileId),
        });
        debugMindMapPersist("auto save suppressed during hydrate", {
          source: saveSource,
        });
        return "deferred";
      }
      if (requestId && settings.autoSaveIdleSec <= 0) {
        traceMindMapOperation(
          "host.queueAutoSave.bypassIdlePolicyDueToRequestId",
          {
            fileId8: fileId?.slice(0, 8) ?? null,
            saveSource,
            requestId,
            autoSaveEnabled: settings.autoSaveEnabled,
            autoSaveIdleSec: settings.autoSaveIdleSec,
            fileStateAtBypass: readMindMapTraceFileState(fileId),
          },
        );
      }
      const delay = requestId ? 0 : settings.autoSaveIdleSec * 1000;
      if (fileId && delay > 0) {
        retainEditorPaneEditPipelineHold(
          releaseAutoSavePipelineRef,
          fileId,
          "mindmap-idle-save",
        );
      }
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        traceMindMapOperation("host.queueAutoSave.timerFired", {
          fileId8: fileId?.slice(0, 8) ?? null,
          saveSource,
          requestId: requestId ?? null,
          delay,
          fileStateAtFire: readMindMapTraceFileState(fileId),
        });
        traceUserAction(
          "mindmap-save",
          "queueAutoSave.timerFired",
          {
            fileId8: fileId?.slice(0, 8) ?? null,
            saveSource,
            requestId: requestId ?? null,
            delay,
          },
          "start",
        );
        if (saveSource === "thumbnail") {
          void (async () => {
            const ok =
              !!fileId &&
              typeof thumbnail === "string" &&
              !!(await persistNativeMindMapThumbnail(
                fileId,
                thumbnail,
                null,
                file?.name,
              ));
            traceMindMapOperation("host.queueAutoSave.thumbnail.after", {
              fileId8: fileId?.slice(0, 8) ?? null,
              requestId: requestId ?? null,
              ok,
              svgLen: typeof thumbnail === "string" ? thumbnail.length : 0,
              fileStateAfterThumbnail: readMindMapTraceFileState(fileId),
            });
            if (requestId) {
              postToNative("mindMapHostSaveStatus", {
                requestId,
                ok,
                error: ok ? null : "MindMap thumbnail export failed",
              });
              nativeSaveCoordinatorRef.current.fulfillCurrentSave(ok);
              pendingNativeSaveSourceRef.current.delete(requestId);
            }
          })();
          return;
        }
        if (
          fileId &&
          isLocalDraftFileId(fileId) &&
          shouldRequestNativeSnapshotForMindMapLocalDraftAutoSave(
            saveSource,
            !!requestId,
          )
        ) {
          traceMindMapOperation(
            "host.queueAutoSave.localDraft.requestNativeSnapshot",
            {
              fileId8: fileId.slice(0, 8),
              saveSource,
              requestId: requestId ?? null,
              fileState: readMindMapTraceFileState(fileId),
            },
          );
          void requestNativeSaveRef.current?.("auto").then((ok) => {
            finishMindMapAutoSaveRequest(ok, "queue-auto-save-local-draft");
          });
          return;
        }
        if (!requestId) {
          traceMindMapOperation("host.queueAutoSave.requestNativeSnapshot", {
            fileId8: fileId?.slice(0, 8) ?? null,
            saveSource,
            fileState: readMindMapTraceFileState(fileId),
          });
          void requestNativeSaveRef.current?.("auto").then((ok) => {
            finishMindMapAutoSaveRequest(ok, "queue-auto-save");
          });
          return;
        }
        void persistMindMapDocument(
          mindMapData,
          saveSource,
          thumbnail,
          requestId,
        ).then((ok) => {
          nativeSaveCoordinatorRef.current.fulfillCurrentSave(ok);
          pendingNativeSaveSourceRef.current.delete(requestId);
        });
      }, delay);
    },
    [file?.name, fileId, finishMindMapAutoSaveRequest, nativeHydratingRef, persistMindMapDocument, postToNative],
  );

  useIdleAutoSaveRearm(
    fileId,
    mountNativeFrame,
    () => {
      const data = latestMindMapDataRef.current;
      if (data) {
        queueAutoSave(data);
      }
    },
    {
      pendingDeferred: () => deferredMindMapAutoSaveRef.current,
      allowInactiveFile: !!pinnedFileId,
      beforeDirtyCheck: flushDraft,
      rearmKey: isPaneForeground,
      onIdleDisabled: () => {
        if (saveTimerRef.current !== null) {
          window.clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        releaseEditorPaneEditPipelineHold(releaseAutoSavePipelineRef);
      },
    },
  );

  const requestNativeSave = useCallback(
    (source: ActiveEditorSaveSource = "manual") => {
      if (
        source === "exit" &&
        fileId &&
        canSkipMindMapNativeSyncOnLeave(fileId)
      ) {
        devDebug("mindmap-bridge", "requestNativeSave skipped: clean exit", {
          source,
          fileId8: fileId.slice(0, 8),
        });
        traceMindMapOperation("host.requestNativeSave.skipCleanExit", {
          fileId8: fileId.slice(0, 8),
          source,
          fileState: readMindMapTraceFileState(fileId),
        });
        return Promise.resolve(true);
      }
      if (!isNativeReady) {
        devDebug("mindmap-bridge", "requestNativeSave skipped: not ready", {
          source,
        });
        traceMindMapOperation("host.requestNativeSave.skipNotReady", {
          fileId8: fileId?.slice(0, 8) ?? null,
          source,
          fileState: readMindMapTraceFileState(fileId),
        });
        return Promise.resolve(false);
      }
      if (
        fileId &&
        isLocalDraftFileId(fileId) &&
        (shouldUseNativeSaveDialogForDraft(fileId) ||
          localDraftNeedsSaveFolderPicker(file?.folder_id)) &&
        (source === "manual" || source === "exit")
      ) {
        openSaveDialog(source === "exit");
        return Promise.resolve(false);
      }
      const releasePaneBoost = beginMindMapNativeSavePaneBoost(
        shellRootRef.current,
        isPaneForeground,
      );
      if (fileId) {
        transferEditorPaneEditPipelineHold(
          releaseAutoSavePipelineRef,
          releaseNativeSavePipelineRef,
          fileId,
          "mindmap-native-save",
        );
      }
      const nativeSaveStartedAt =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const savePromise = (async () => {
        if (!isPaneForeground) {
          await waitForMindMapNativeSavePaneBoost();
        }
        const promise =
          nativeSaveCoordinatorRef.current.requestNativeSave(source);
        const requestId =
          nativeSaveCoordinatorRef.current.getCurrentRequestId();
        devDebug("mindmap-bridge", "requestNativeSave | start", {
          requestId,
          source,
          paneBoost: !isPaneForeground,
        });
        traceMindMapOperation("host.requestNativeSave.start", {
          fileId8: fileId?.slice(0, 8) ?? null,
          requestId,
          source,
          paneBoost: !isPaneForeground,
          fileStateAtRequest: readMindMapTraceFileState(fileId),
        });
        traceUserAction(
          "mindmap-save",
          "requestNativeSave",
          {
            fileId8: fileId?.slice(0, 8) ?? null,
            requestId,
            source,
            paneBoost: !isPaneForeground,
            paneForeground: isPaneForeground,
          },
          "start",
        );
        void promise.finally(() => {
          if (
            requestId &&
            pendingNativeSaveRequestIdRef.current === requestId
          ) {
            pendingNativeSaveRequestIdRef.current = null;
            pendingNativeSaveSourceRef.current.delete(requestId);
          }
        });
        return promise;
      })();
      void savePromise.then(
        (ok) => {
          const elapsedMs = Math.round(
            (typeof performance !== "undefined"
              ? performance.now()
              : Date.now()) - nativeSaveStartedAt,
          );
          traceUserAction(
            "mindmap-save",
            "requestNativeSave",
            {
              fileId8: fileId?.slice(0, 8) ?? null,
              source,
              ok,
              paneBoost: !isPaneForeground,
              elapsedMs,
            },
            ok ? "ok" : "fail",
          );
        },
        (error) => {
          const elapsedMs = Math.round(
            (typeof performance !== "undefined"
              ? performance.now()
              : Date.now()) - nativeSaveStartedAt,
          );
          traceUserAction(
            "mindmap-save",
            "requestNativeSave",
            {
              fileId8: fileId?.slice(0, 8) ?? null,
              source,
              paneBoost: !isPaneForeground,
              elapsedMs,
              error:
                error instanceof Error
                  ? { message: error.message, name: error.name }
                  : { value: String(error) },
            },
            "fail",
          );
        },
      );
      void savePromise.finally(() => {
        releasePaneBoost();
        releaseEditorPaneEditPipelineHold(releaseNativeSavePipelineRef);
      });
      return savePromise;
    },
    [file?.folder_id, fileId, isNativeReady, isPaneForeground, openSaveDialog],
  );

  useEffect(() => {
    requestNativeSaveRef.current = requestNativeSave;
    return () => {
      if (requestNativeSaveRef.current === requestNativeSave) {
        requestNativeSaveRef.current = null;
      }
    };
  }, [requestNativeSave]);

  useEffect(() => {
    queueAutoSaveRef.current = queueAutoSave;
    return () => {
      if (queueAutoSaveRef.current === queueAutoSave) {
        queueAutoSaveRef.current = null;
      }
    };
  }, [queueAutoSave]);

  useEffect(() => {
    if (!fileId || !isNativeReady || !nativeHydrateSettled) {
      return;
    }
    flushDeferredMindMapAutoSave("native-ready");
  }, [
    fileId,
    flushDeferredMindMapAutoSave,
    isNativeReady,
    nativeHydrateSettled,
  ]);

  useEffect(() => {
    if (!fileId || !isPaneForeground) {
      return;
    }
    const onVisibilityChange = () => {
      if (!document.hidden) {
        flushDraft();
        flushDeferredMindMapAutoSave("document-visible");
        return;
      }
      flushMindMapAutoSaveWhenInactive("document-hidden");
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [
    fileId,
    flushDraft,
    flushDeferredMindMapAutoSave,
    flushMindMapAutoSaveWhenInactive,
    isPaneForeground,
  ]);

  const persistLocalMindMapSnapshot = useCallback(
    (document: ReturnType<typeof MindMapAdapter.toDocument>, reason: string) => {
      if (!fileId) {
        return;
      }
      const state = evaluateCurrentFileModificationState({
        fileId,
        kind: "mindmap",
        mindMapDocument: document,
      });
      if (
        state.modified ||
        isMindMapNativeDirtyPending(fileId) ||
        isLocalDraftFileId(fileId)
      ) {
        recordMindMapDraft(fileId, document);
      } else {
        applyFileModificationState(fileId, state, {
          reason,
        });
      }
    },
    [fileId],
  );

  const requestNativeSnapshot = useCallback(
    (source: ActiveEditorSnapshotSource) => {
      flushDraft();
      if (!fileId) {
        return Promise.resolve(true);
      }
      if (!isNativeReady) {
        const document = latestDocumentRef.current;
        if (document) {
          persistLocalMindMapSnapshot(document, `mindmap.snapshot.${source}`);
        }
        return Promise.resolve(true);
      }
      const requestId = createMindMapBridgeRequestId();
      pendingNativeSnapshotRequestIdRef.current = requestId;
      traceMindMapOperation("host.requestNativeSnapshot.start", {
        fileId8: fileId.slice(0, 8),
        requestId,
        source,
        fileStateBefore: readMindMapTraceFileState(fileId),
      });
      return new Promise<boolean>((resolve) => {
        const timer = window.setTimeout(() => {
          pendingNativeSnapshotRef.current.delete(requestId);
          pendingNativeSnapshotSourceRef.current.delete(requestId);
          pendingNativeSnapshotRequestIdRef.current = null;
          traceMindMapOperation("host.requestNativeSnapshot.timeout", {
            fileId8: fileId.slice(0, 8),
            requestId,
            source,
            fileStateAtTimeout: readMindMapTraceFileState(fileId),
          });
          resolve(false);
        }, NATIVE_SAVE_TIMEOUT_MS);
        pendingNativeSnapshotRef.current.set(requestId, (ok) => {
          window.clearTimeout(timer);
          pendingNativeSnapshotRef.current.delete(requestId);
          pendingNativeSnapshotSourceRef.current.delete(requestId);
          pendingNativeSnapshotRequestIdRef.current = null;
          traceMindMapOperation("host.requestNativeSnapshot.resolve", {
            fileId8: fileId.slice(0, 8),
            requestId,
            source,
            ok,
            fileStateAtResolve: readMindMapTraceFileState(fileId),
          });
          resolve(ok);
        });
        pendingNativeSnapshotSourceRef.current.set(requestId, source);
        postToNative("requestMindMapSave", {
          requestId,
          snapshotOnly: true,
          snapshotSource: source,
        });
      });
    },
    [fileId, flushDraft, isNativeReady, persistLocalMindMapSnapshot, postToNative],
  );

  useEffect(() => {
    if (!fileId) {
      return;
    }
    return registerEditorTabSnapshotHandler(fileId, async (source) => {
      const ok = await requestNativeSnapshot(source);
      return {
        ok: source === "tab-close" ? true : ok,
        reason: ok ? source : "native-snapshot-failed",
      };
    });
  }, [fileId, requestNativeSnapshot]);

  const saveAndArchiveCurrentVersion = useCallback(async (): Promise<boolean> => {
    if (!fileId || isLocalDraftFileId(fileId)) {
      return false;
    }
    setArchiveSaving(true);
    try {
      const saved = await requestNativeSave("manual");
      if (!saved) {
        return false;
      }
      await ServerSync.createArchive(fileId, CHECKPOINT_LABELS.manual);
      window.dispatchEvent(new CustomEvent("excalidraw-server-saved"));
      return true;
    } finally {
      setArchiveSaving(false);
    }
  }, [fileId, requestNativeSave]);

  const persistNativeThumbnail = useCallback(
    async (rawSvg: string, revision?: number) => {
      if (!fileId || nativeThumbnailSaveInFlightRef.current) {
        return;
      }
      if (revision != null && revision < latestDataRevisionRef.current) {
        devDebug("mindmap-bridge", "saveMindMapThumbnail skipped (stale)", {
          revision,
          latest: latestDataRevisionRef.current,
        });
        return;
      }
      const mindMapData = latestMindMapDataRef.current;
      const document = mindMapData
        ? MindMapAdapter.toDocument(mindMapData)
        : null;
      nativeThumbnailSaveInFlightRef.current = true;
      try {
        traceMindMapOperation("host.persistNativeThumbnail.start", {
          fileId8: fileId.slice(0, 8),
          revision: revision ?? null,
          svgLen: rawSvg.length,
          document: summarizeMindMapTraceDocument(document),
          fileStateBefore: readMindMapTraceFileState(fileId),
        });
        devDebug("mindmap-bridge", "saveMindMapThumbnail", {
          revision: revision ?? null,
          svgLen: rawSvg.length,
        });
        await persistNativeMindMapThumbnail(
          fileId,
          rawSvg,
          document,
          file?.name,
        );
        traceMindMapOperation("host.persistNativeThumbnail.after", {
          fileId8: fileId.slice(0, 8),
          revision: revision ?? null,
          svgLen: rawSvg.length,
          fileStateAfter: readMindMapTraceFileState(fileId),
        });
        window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
        window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        traceMindMapOperation("host.persistNativeThumbnail.fail", {
          fileId8: fileId.slice(0, 8),
          revision: revision ?? null,
          svgLen: rawSvg.length,
          message,
          fileStateAfterError: readMindMapTraceFileState(fileId),
        });
        setStatusMessage(message);
      } finally {
        nativeThumbnailSaveInFlightRef.current = false;
      }
    },
    [file?.name, fileId],
  );

  useEffect(() => {
    if (!fileId) {
      return;
    }
    return registerEditorTabSaveHandler(fileId, (source) => {
      const settings = getAppSettings();
      traceMindMapOperation("host.activeEditorSave.requested", {
        fileId8: fileId?.slice(0, 8) ?? null,
        source,
        autoSaveEnabled: settings.autoSaveEnabled,
        autoSaveIdleSec: settings.autoSaveIdleSec,
        fileStateAtRequest: readMindMapTraceFileState(fileId),
      });
      return requestNativeSave(source);
    });
  }, [fileId, requestNativeSave]);

  const discardEditsForLeave = useCallback(async () => {
    if (!fileId) {
      return;
    }
    flushDraft();
    if (isLocalDraftFileId(fileId)) {
      await discardLocalDraftSession(fileId);
      return;
    }
    FileSyncState.clearLocalCache(fileId);
    const baselineHash = FileSyncState.getBaselineHash(fileId);
    if (baselineHash) {
      FileSyncState.setDraftHash(fileId, baselineHash);
      markDocumentCommitted(fileId, baselineHash);
    } else {
      FileSyncState.clearDraftHash(fileId);
      FileSyncState.clearBaselineHash(fileId);
    }
    FileSyncState.clearLocalEditTime(fileId);
    window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
    window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
  }, [fileId, flushDraft]);

  useEffect(() => {
    if (!fileId) {
      return;
    }
    return registerEditorTabDiscardHandler(fileId, discardEditsForLeave);
  }, [discardEditsForLeave, fileId]);

  useEffect(() => {
    if (!fileId) {
      initialThumbnailGateRef.current.needsRefresh = false;
      setNativeHydrateSettled(false);
      return;
    }
    initialThumbnailGateRef.current.needsRefresh = false;
    setNativeHydrateSettled(false);
  }, [fileId]);

  useEffect(() => {
    if (!fileId || !isNativeReady || !nativeHydrateSettled) {
      return;
    }
    if (!initialThumbnailGateRef.current.needsRefresh) {
      return;
    }
    initialThumbnailGateRef.current.needsRefresh = false;
    needsInitialThumbnailRef.current = false;
    devDebug("mindmap-bridge", "trigger initial thumbnail save", {
      source: "thumbnail",
      fileId8: fileId.slice(0, 8),
      afterHydrate: true,
    });
    void requestNativeSave("thumbnail");
  }, [fileId, isNativeReady, nativeHydrateSettled, initialThumbnailRequestTick, requestNativeSave]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (!isMessageFromCurrentIframe(event.source)) {
        return;
      }
      if (
        !isAllowedNativeMindMapMessageOrigin(event.origin, {
          iframeSrc: iframeRef.current?.src ?? null,
          learnedOrigin,
        })
      ) {
        return;
      }
      if (!isNativeMindMapMessage(event.data)) {
        return;
      }

      if (event.data.type === "mindMapNativeDebug") {
        debugMindMapNative(event.data.payload);
        return;
      }
      if (
        event.data.type === "CLIPBOARD_WRITE_TEXT" ||
        event.data.type === "CLIPBOARD_READ_TEXT" ||
        event.data.type === "CLIPBOARD_READ" ||
        event.data.type === "CLIPBOARD_WRITE_IMAGE"
      ) {
        void handleNativeClipboardMessage(event.data);
        return;
      }

      if (handleBridgeLifecycleMessage(event.data, event.origin)) {
        return;
      }

      if (event.data.type === "mindMapSaveProgress") {
        const payload =
          event.data.payload &&
          typeof event.data.payload === "object" &&
          !Array.isArray(event.data.payload)
            ? (event.data.payload as Record<string, unknown>)
            : {};
        traceUserAction(
          "mindmap-native",
          "saveProgress",
          {
            fileId8: fileId?.slice(0, 8) ?? null,
            ...payload,
          },
          payload.phase === "failed" || payload.phase === "skipped-not-ready"
            ? "fail"
            : "ok",
        );
        return;
      }

      if (event.data.type === "mindMapNativeOperationTrace") {
        const payload =
          event.data.payload &&
          typeof event.data.payload === "object" &&
          !Array.isArray(event.data.payload)
            ? (event.data.payload as Record<string, unknown>)
            : {};
        traceMindMapOperation("native.trace", {
          fileId8: fileId?.slice(0, 8) ?? null,
          ...payload,
          fileStateAtHostReceive: readMindMapTraceFileState(fileId),
        });
        if (
          typeof payload.label === "string" &&
          payload.label.startsWith("requestMindMapSave")
        ) {
          traceUserAction(
            "mindmap-native",
            "saveProgress",
            {
              fileId8: fileId?.slice(0, 8) ?? null,
              ...payload,
            },
            payload.label.includes("failed") ? "fail" : "ok",
          );
        }
        return;
      }

      const markConfigChangedUnlessHydrating = (type: string) => {
        if (!fileId || nativeHydratingRef.current) {
          debugMindMapPersist("config change suppressed during hydrate", {
            type,
            fileId8: fileId?.slice(0, 8) ?? null,
          });
          return;
        }
        if (isMindMapNativeDirtyPending(fileId)) {
          debugMindMapPersist(
            "config change skipped while native dirty pending",
            {
              type,
              fileId8: fileId.slice(0, 8),
            },
          );
          return;
        }
        if (FileSyncState.hasUnsavedChanges(fileId)) {
          debugMindMapPersist(
            "config change skipped while file already dirty",
            {
              type,
              fileId8: fileId.slice(0, 8),
            },
          );
          return;
        }
        if (latestDocumentRef.current) {
          markDocumentChanged(latestDocumentRef.current);
        }
      };

      if (event.data.type === "saveMindMapConfig") {
        const current = latestDocumentRef.current;
        if (!current) {
          return;
        }
        const config =
          event.data.payload &&
          typeof event.data.payload === "object" &&
          !Array.isArray(event.data.payload)
            ? (event.data.payload as Record<string, unknown>)
            : undefined;
        const document = MindMapAdapter.toDocument({
          ...current.data,
          config: compactMindMapPersistedConfig(config),
        });
        latestDocumentRef.current = document;
        latestMindMapDataRef.current = document.data;
        markConfigChangedUnlessHydrating(event.data.type);
        return;
      }

      if (event.data.type === "saveLocalConfig") {
        const current = latestDocumentRef.current;
        if (!current) {
          return;
        }
        const localConfig =
          event.data.payload &&
          typeof event.data.payload === "object" &&
          !Array.isArray(event.data.payload)
            ? (event.data.payload as Record<string, unknown>)
            : null;
        const document = MindMapAdapter.toDocument({
          ...current.data,
          localConfig,
        });
        latestDocumentRef.current = document;
        latestMindMapDataRef.current = document.data;
        markConfigChangedUnlessHydrating(event.data.type);
        return;
      }

      if (event.data.type === "mindMapSaveProgress") {
        nativeSaveCoordinatorRef.current.handleSaveProgress(event.data.payload);
        return;
      }

      if (event.data.type === "saveMindMapData") {
        const parsed = parseMindMapSavePayload(event.data.payload);
        if (!parsed) {
          debugMindMapPersist("[DEBUG] saveMindMapData | parse rejected", {
            fileId8: fileId?.slice(0, 8) ?? null,
          });
          return;
        }
        const saveCorrelation =
          nativeSaveCoordinatorRef.current.correlateSaveResponse(
            parsed.requestId,
          );
        const isCurrentSaveResponse =
          saveCorrelation.isCurrentSaveResponse;
        const isCurrentSnapshotResponse =
          !!parsed.requestId &&
          parsed.requestId === pendingNativeSnapshotRequestIdRef.current;
        traceMindMapOperation("host.message.saveMindMapData.received", {
          fileId8: fileId?.slice(0, 8) ?? null,
          requestId: parsed.requestId ?? null,
          revision: parsed.revision ?? null,
          isCurrentSaveResponse,
          isCurrentSnapshotResponse,
          hostWaitedMs: saveCorrelation.hostWaitedMs,
          userEdit: parsed.userEdit,
          reason: parsed.reason ?? null,
          hydrating: nativeHydratingRef.current,
          hasThumbnail:
            typeof parsed.thumbnail === "string" && parsed.thumbnail.length > 0,
          data: summarizeMindMapTraceData(parsed.mindMapData),
          fileStateBeforeHandle: readMindMapTraceFileState(fileId),
        });
        debugMindMapPersist("[DEBUG] received saveMindMapData from iframe", {
          isCurrentSaveResponse,
          requestId: parsed.requestId ?? null,
          revision: parsed.revision ?? null,
          userEdit: parsed.userEdit,
          hydrating: nativeHydratingRef.current,
          fileId8: fileId?.slice(0, 8) ?? null,
        });
        if (
          saveCorrelation.isStaleRequestId &&
          parsed.requestId !== pendingNativeSnapshotRequestIdRef.current
        ) {
          traceMindMapOperation(
            "host.message.saveMindMapData.skipStaleRequest",
            {
              fileId8: fileId?.slice(0, 8) ?? null,
              requestId: parsed.requestId,
              pendingRequestId: saveCorrelation.hostRequestId,
              revision: parsed.revision ?? null,
              fileStateAtSkip: readMindMapTraceFileState(fileId),
            },
          );
          return;
        }
        if (
          !isCurrentSaveResponse &&
          !isCurrentSnapshotResponse &&
          parsed.revision != null &&
          parsed.revision < latestNativeRevisionRef.current
        ) {
          debugMindMapPersist(
            "[DEBUG] saveMindMapData | stale revision skipped",
            {
              revision: parsed.revision,
              latest: latestNativeRevisionRef.current,
            },
          );
          traceMindMapOperation(
            "host.message.saveMindMapData.skipStaleRevision",
            {
              fileId8: fileId?.slice(0, 8) ?? null,
              requestId: parsed.requestId ?? null,
              revision: parsed.revision,
              latest: latestNativeRevisionRef.current,
              fileStateAtSkip: readMindMapTraceFileState(fileId),
            },
          );
          return;
        }
        if (parsed.revision != null) {
          latestDataRevisionRef.current = parsed.revision;
          latestNativeRevisionRef.current = parsed.revision;
        }
        latestMindMapDataRef.current = parsed.mindMapData;
        const parsedDocument = MindMapAdapter.toDocument(parsed.mindMapData);
        const draftResult = hydrateCoordinatorRef.current.handleDraftPush(
          parsedDocument,
          latestDocumentRef.current,
          {
            isSaveResponse: isCurrentSaveResponse,
            hydrating: nativeHydratingRef.current,
            userEdit: parsed.userEdit,
          },
        );
        const { document, decision: hydrateDecision } = draftResult;
        latestDocumentRef.current = document;
        traceMindMapOperation("host.message.saveMindMapData.decision", {
          fileId8: fileId?.slice(0, 8) ?? null,
          requestId: parsed.requestId ?? null,
          revision: parsed.revision ?? null,
          isCurrentSaveResponse,
          isCurrentSnapshotResponse,
          userEdit: parsed.userEdit,
          reason: parsed.reason ?? null,
          hydrateDecision: hydrateDecision.reason,
          shouldExtendSettle: draftResult.shouldExtendSettle,
          shouldAdoptBaseline: draftResult.shouldAdoptBaseline,
          shouldMarkChanged: draftResult.shouldMarkChanged,
          document: summarizeMindMapTraceDocument(document),
          fileStateBeforeDecisionAction: readMindMapTraceFileState(fileId),
        });
        debugMindMapPersist("[DEBUG] saveMindMapData parsed", {
          isCurrentSaveResponse,
          isCurrentSnapshotResponse,
          revision: parsed.revision ?? null,
          fileId8: fileId?.slice(0, 8) ?? null,
          hydrateDecision: hydrateDecision.reason,
          userEdit: parsed.userEdit,
          reason: parsed.reason ?? null,
          adoptBaseline: hydrateDecision.adoptBaseline,
          updateHostDocument: hydrateDecision.updateHostDocument,
          richText: summarizeMindMapRichTextTree(parsed.mindMapData),
          sampleNode: findFirstRichMindMapNodeSummary(parsed.mindMapData),
          syncState: fileId ? FileSyncState.getSyncState(fileId) : null,
        });
        if (parsed.thumbnail) {
          const decodedThumb = decodeMindMapThumbnailPayload(parsed.thumbnail);
          if (decodedThumb && fileId && !isCurrentSaveResponse) {
            cacheDraftThumbnailIfVisible(
              fileId,
              "mindmap",
              decodedThumb,
              hashDocumentSnapshot(parsedDocument),
            );
          }
        }
        if (isCurrentSnapshotResponse) {
          const snapshotSource = parsed.requestId
            ? pendingNativeSnapshotSourceRef.current.get(parsed.requestId)
            : undefined;
          traceMindMapOperation(
            "host.message.saveMindMapData.action.snapshotResponse",
            {
              fileId8: fileId?.slice(0, 8) ?? null,
              requestId: parsed.requestId ?? null,
              revision: parsed.revision ?? null,
              source: snapshotSource ?? null,
              fileStateBeforeSnapshot: readMindMapTraceFileState(fileId),
            },
          );
          flushDraft();
          if (fileId) {
            persistLocalMindMapSnapshot(
              document,
              `mindmap.snapshot.${snapshotSource ?? "tab-switch"}`,
            );
          }
          syncRootTextToFileName(document.data);
          const resolveSnapshot = parsed.requestId
            ? pendingNativeSnapshotRef.current.get(parsed.requestId)
            : null;
          resolveSnapshot?.(true);
          return;
        }
        if (isCurrentSaveResponse) {
          traceMindMapOperation(
            "host.message.saveMindMapData.action.saveResponse",
            {
              fileId8: fileId?.slice(0, 8) ?? null,
              requestId: parsed.requestId ?? null,
              revision: parsed.revision ?? null,
              fileStateBeforeQueue: readMindMapTraceFileState(fileId),
            },
          );
          queueAutoSave(
            parsed.mindMapData,
            parsed.thumbnail,
            parsed.requestId ?? null,
          );
        } else if (draftResult.shouldExtendSettle) {
          extendNativeHydrateSettle("draft-push");
          const hasUserDirtyPending =
            !!fileId && isMindMapNativeDirtyPending(fileId);
          if (fileId && draftResult.shouldAdoptBaseline && !hasUserDirtyPending) {
            adoptMindMapNativeBaseline(fileId, document);
            traceMindMapOperation(
              "host.message.saveMindMapData.action.adoptBaseline",
              {
                fileId8: fileId.slice(0, 8),
                requestId: parsed.requestId ?? null,
                revision: parsed.revision ?? null,
                reason: hydrateDecision.reason,
                fileStateAfterAdopt: readMindMapTraceFileState(fileId),
              },
            );
            debugMindMapPersist("hydrate draft adopted", {
              revision: parsed.revision ?? null,
              fileId8: fileId.slice(0, 8),
              reason: hydrateDecision.reason,
            });
          } else if (fileId) {
            traceMindMapOperation(
              "host.message.saveMindMapData.action.extendSettleOnly",
              {
                fileId8: fileId.slice(0, 8),
                requestId: parsed.requestId ?? null,
                revision: parsed.revision ?? null,
                reason: hydrateDecision.reason,
                fileStateAfterExtend: readMindMapTraceFileState(fileId),
              },
            );
            debugMindMapPersist("hydrate draft rejected", {
              revision: parsed.revision ?? null,
              fileId8: fileId.slice(0, 8),
              reason: hydrateDecision.reason,
            });
          }
        } else if (
          draftResult.shouldMarkChanged ||
          (fileId &&
            isMindMapNativeDirtyPending(fileId) &&
            !isCurrentSaveResponse &&
            !isCurrentSnapshotResponse)
        ) {
          traceMindMapOperation(
            "host.message.saveMindMapData.action.markChanged",
            {
              fileId8: fileId?.slice(0, 8) ?? null,
              requestId: parsed.requestId ?? null,
              revision: parsed.revision ?? null,
              reason: hydrateDecision.reason,
              nativeDirtyPending: fileId
                ? isMindMapNativeDirtyPending(fileId)
                : false,
              fileStateBeforeMarkChanged: readMindMapTraceFileState(fileId),
            },
          );
          markDocumentChanged(document);
          queueAutoSave(parsed.mindMapData, parsed.thumbnail, null);
        }
        syncRootTextToFileName(document.data);
        devDebug("mindmap-bridge", "saveMindMapData", {
          revision: parsed.revision ?? null,
          requestId: parsed.requestId ?? null,
          hydrateReason: hydrateDecision.reason,
        });
        return;
      }

      if (event.data.type === "mindMapDirtyState") {
        const userEdit = isMindMapDirtyStateUserEdit(event.data.payload);
        const dirtyPayload =
          event.data.payload &&
          typeof event.data.payload === "object" &&
          !Array.isArray(event.data.payload)
            ? (event.data.payload as Record<string, unknown>)
            : {};
        traceMindMapOperation("host.message.mindMapDirtyState.received", {
          fileId8: fileId?.slice(0, 8) ?? null,
          userEdit,
          reason:
            typeof dirtyPayload.reason === "string"
              ? dirtyPayload.reason
              : null,
          revision:
            typeof dirtyPayload.revision === "number"
              ? dirtyPayload.revision
              : null,
          hydrating: nativeHydratingRef.current,
          fileStateBeforeDirty: readMindMapTraceFileState(fileId),
        });
        traceUserAction(
          "mindmap-dirty",
          "nativeDirtyState",
          {
            fileId8: fileId?.slice(0, 8) ?? null,
            userEdit,
            reason:
              typeof dirtyPayload.reason === "string"
                ? dirtyPayload.reason
                : null,
            revision:
              typeof dirtyPayload.revision === "number"
                ? dirtyPayload.revision
                : null,
            hydrating: nativeHydratingRef.current,
          },
          "start",
        );
        if (
          shouldSuppressMindMapDirtyState({
            hydrating: nativeHydratingRef.current,
            userEdit,
          })
        ) {
          traceMindMapOperation("host.message.mindMapDirtyState.suppressed", {
            fileId8: fileId?.slice(0, 8) ?? null,
            userEdit,
            reason:
              typeof dirtyPayload.reason === "string"
                ? dirtyPayload.reason
                : null,
            fileStateAtSuppress: readMindMapTraceFileState(fileId),
          });
          debugMindMapOpen("mindMapDirtyState suppressed during hydrate", {
            userEdit,
          });
          return;
        }
        markNativeDocumentDirty();
        const pendingData =
          latestMindMapDataRef.current ??
          latestDocumentRef.current?.data ??
          null;
        if (pendingData) {
          queueAutoSave(pendingData);
        }
        traceMindMapOperation("host.message.mindMapDirtyState.afterMarkDirty", {
          fileId8: fileId?.slice(0, 8) ?? null,
          userEdit,
          reason:
            typeof dirtyPayload.reason === "string"
              ? dirtyPayload.reason
              : null,
          fileStateAfterDirty: readMindMapTraceFileState(fileId),
        });
        return;
      }

      if (event.data.type === "saveMindMapThumbnail") {
        const parsed = parseMindMapThumbnailPayload(event.data.payload);
        if (!parsed) {
          return;
        }
        const decoded = decodeMindMapThumbnailPayload(parsed.thumbnail);
        if (!decoded) {
          debugMindMapPersist("[DEBUG] saveMindMapThumbnail | decode failed", {
            fileId8: fileId?.slice(0, 8) ?? null,
            rawLen: parsed.thumbnail.length,
          });
          return;
        }
        const currentDocument = latestDocumentRef.current;
        if (fileId && currentDocument) {
          const currentHash = hashDocumentSnapshot(currentDocument);
          cacheDraftThumbnailIfVisible(
            fileId,
            "mindmap",
            decoded,
            currentHash,
          );
          const savedTarget = lastSavedThumbnailTargetRef.current;
          const savedTargetMatches =
            !!savedTarget &&
            savedTarget.fileId === fileId &&
            savedTarget.documentHash === currentHash;
          logPerf("thumbnail.native_received", {
            fileId8: fileId.slice(0, 8),
            revision: parsed.revision ?? null,
            thumbLen: decoded.length,
            currentHash8: currentHash.slice(0, 8),
            savedTargetDocHash8:
              savedTarget?.documentHash?.slice(0, 8) ?? null,
            savedTargetSha8: savedTarget?.contentSha?.slice(0, 8) ?? null,
            savedTargetMatches,
          });
          if (savedTargetMatches) {
            scheduleSavedFileThumbnailUpload({
              ...savedTarget,
              thumbnail: decoded,
              documentHash: currentHash,
            });
            return;
          }
        }
        void persistNativeThumbnail(decoded, parsed.revision);
        return;
      }

      if (event.data.type === "mindMapViewState") {
        if (fileId) {
          saveMindMapBrowserView(fileId, event.data.payload);
        }
        return;
      }

      if (event.data.type === "hostRequestSave") {
        void requestNativeSave("manual");
        return;
      }
      if (event.data.type === "hostOpenHistory") {
        if (fileId && !isLocalDraftFileId(fileId)) {
          setShowHistoryPanel(true);
        }
        return;
      }
      if (event.data.type === "hostBackToFiles") {
        activateHomeTabWithoutSnapshot();
        return;
      }

      if (event.data.type === "mindMapIframeError") {
        const payload = event.data.payload as
          | {
              message?: string;
              kind?: string;
              source?: string | null;
              line?: number | null;
              column?: number | null;
            }
          | undefined;
        traceUserAction(
          "mindmap-native",
          "iframeError",
          {
            fileId8: fileId?.slice(0, 8) ?? null,
            kind: payload?.kind ?? null,
            message: payload?.message ?? null,
            source: payload?.source ?? null,
            line: payload?.line ?? null,
            column: payload?.column ?? null,
          },
          "fail",
        );
        setStatusMessage(payload?.message || "MindMap iframe error");
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [
    activateHomeTabWithoutSnapshot,
    extendNativeHydrateSettle,
    fileId,
    handleBridgeLifecycleMessage,
    handleNativeClipboardMessage,
    isMessageFromCurrentIframe,
    isPaneForeground,
    learnedOrigin,
    markDocumentChanged,
    markNativeDocumentDirty,
    nativeHydratingRef,
    persistNativeThumbnail,
    pinnedFileId,
    queueAutoSave,
    requestNativeSave,
    syncRootTextToFileName,
  ]);

  useEffect(() => {
    const onSave = () => {
      void requestNativeSave("manual");
    };
    const onExport = () => {
      postToNative("mindMapHostOpenExport");
    };
    const onImport = () => {
      postToNative("mindMapHostOpenImport");
    };
    const onEmbed = () => {
      if (!fileId || isLocalDraftFileId(fileId)) {
        return;
      }
      postToNative("hostOpenEmbedManager");
    };
    const onHistory = () => {
      if (!fileId || isLocalDraftFileId(fileId)) {
        return;
      }
      setShowHistoryPanel(true);
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
    window.addEventListener("mindmap-host-request-save", onSave);
    window.addEventListener("mindmap-host-open-export", onExport);
    window.addEventListener("mindmap-host-open-import", onImport);
    window.addEventListener("mindmap-host-open-history", onHistory);
    window.addEventListener("mindmap-host-open-embed", onEmbed);
    return () => {
      window.removeEventListener(EDITOR_HOST_COMMAND_EVENT, onHostCommand);
      window.removeEventListener("mindmap-host-request-save", onSave);
      window.removeEventListener("mindmap-host-open-export", onExport);
      window.removeEventListener("mindmap-host-open-import", onImport);
      window.removeEventListener("mindmap-host-open-history", onHistory);
      window.removeEventListener("mindmap-host-open-embed", onEmbed);
    };
  }, [fileId, postToNative, requestNativeSave]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      releaseEditorPaneEditPipelineHold(releaseAutoSavePipelineRef);
      releaseEditorPaneEditPipelineHold(releaseNativeSavePipelineRef);
      if (missingFileRedirectTimerRef.current !== null) {
        window.clearTimeout(missingFileRedirectTimerRef.current);
      }
    };
  }, []);

  const displayError = error ?? bridgeError;

  if (displayError) {
    return <div style={{ padding: 24, color: "#c92a2a" }}>{displayError}</div>;
  }

  if (!file) {
    return <div style={{ padding: 24 }}>正在加载...</div>;
  }

  return (
    <div className="mindmap-editor" ref={shellRootRef}>
      {statusMessage ? (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            zIndex: 2,
            padding: "6px 10px",
            background: "rgba(15,23,42,.82)",
            color: "#fff",
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          {statusMessage}
        </div>
      ) : null}
      {mountNativeFrame ? (
        <iframe
          key={bootKey}
          ref={iframeRef}
          title={file.name || "MindMap"}
          src="/mind-map/index.html"
          className="mindmap-editor__native-frame"
          onLoad={onIframeLoad}
          onError={onIframeError}
        />
      ) : null}
      {fileId && !isLocalDraftFileId(fileId) && showHistoryPanel ? (
        <ArchivePanel
          fileId={fileId}
          saving={archiveSaving}
          onSave={() => requestNativeSave("manual")}
          onArchive={saveAndArchiveCurrentVersion}
          readCurrentModificationState={() => {
            const document = latestDocumentRef.current;
            if (!document || !fileId) {
              return readStoredFileModificationState(fileId, "mindmap");
            }
            return evaluateCurrentFileModificationState({
              fileId,
              kind: "mindmap",
              mindMapDocument: document,
            });
          }}
          onAfterRestore={async () => {
            await reloadFromServer();
          }}
          onClose={() => setShowHistoryPanel(false)}
        />
      ) : null}
      <SaveNewDocumentDialog
        open={saveOpen}
        saving={saveInFlight}
        overlayDismiss={saveOverlayDismiss}
        defaultName={defaultSaveName()}
        documentKind="mindmap"
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
