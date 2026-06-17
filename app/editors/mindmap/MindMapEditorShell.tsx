import { useCallback, useEffect, useRef, useState } from "react";

import {
  isAutoSaveEligibleForCurrentFile,
  registerAutoSaveTrigger,
} from "../../data/autoSaveSession";
import { useRemoteFileRefresh } from "../../hooks/useRemoteFileRefresh";
import { requestSave, requestSaveAndWait } from "../../data/saveQueue";
import { SettingsPanel } from "../../components/SettingsPanel";
import { ArchivePanel } from "../../components/ArchivePanel";
import {
  evaluateCurrentFileModificationState,
  readStoredFileModificationState,
} from "../../data/fileModificationState";
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
import { LocalDraftLossConfirmDialog } from "../../components/LocalDraftLossConfirmDialog";
import { RemoteUpdateConfirmDialog } from "../../components/RemoteUpdateConfirmDialog";
import { SaveNewDocumentDialog } from "../../components/PromoteTempFileDialog";
import { DEFAULT_DOCUMENT_DISPLAY_NAME } from "../../data/defaultDocumentName";
import { useLocalDraftLossConfirm } from "../../hooks/useLocalDraftLossConfirm";
import { useSaveNewDocumentDialog } from "../../hooks/useSaveNewDocumentDialog";
import { bootstrapLocalDraftSession } from "../../data/bootstrapLocalDraftSession";
import { isLegacyTempFileId, isNewDocumentHash } from "../../data/documentHash";
import { isLocalDraftFileId } from "../../data/localDraftFileId";
import {
  LocalDraftSessions,
  notifyLocalDraftEdited,
} from "../../data/localDraftSessions";
import { getDocumentKindFromHash } from "../../lib/appBranding";
import { editorRegistry } from "../../editors";
import { FileSyncState } from "../../data/FileSyncState";
import { readFileListTreeCache } from "../../data/fileListSessionCache";
import { getFileIdFromHash } from "../../data/fileIdFromHash";
import { LocalThumbnailCache } from "../../data/localThumbnailCache";
import {
  createEmptyMindMapData,
  isEffectivelyEmptyMindMapData,
  isMindMapSingleRootOnly,
} from "../../data/formats/MindMapAdapter";
import { compactMindMapPersistedConfig } from "../../data/formats/mindMapPersistedConfig";
import { MindMapAdapter } from "../../data/formats/registry";
import {
  clearMindMapBrowserView,
  readMindMapBrowserView,
  saveMindMapBrowserView,
  saveMindMapBrowserViewFromData,
} from "../../data/mindMapBrowserViewStorage";
import {
  logEditorOpenPhase,
  resetEditorOpenPhaseLog,
  shouldOpenCachedDocumentFirst,
  type EditorOpenPhase,
} from "../../lib/editorOpenPhases";
import { hashDocumentSnapshot } from "../../data/sceneHash";
import { ServerSync } from "../../data/ServerSync";
import {
  isSchematicMindMapThumbnailSvg,
} from "../../data/thumbnailSvg";
import {
  debugMindMapBridge,
  warnMindMapBridge,
} from "./mindMapBridgeDebug";
import {
  isNativeMindMapMessage,
  type NativeMindMapMessage,
} from "./mindMapBridgeProtocol";
import {
  describeMindMapBridgeState,
  isAllowedNativeMindMapMessageOrigin,
  NATIVE_MINDMAP_URL,
} from "./mindMapBridgeOrigins";
import { useMindMapHostBridge } from "./useMindMapHostBridge";
import { toNativeMindMapBridgePayload } from "./mindMapBridgePayload";
import { decodeNativeMindMapThumbnail } from "./mindMapNativeThumbnailRenderer";
import { recordMindMapPersisted } from "./mindMapPersistCoordinator";
import { explainRefreshCacheOnOpen } from "./mindMapOpenSyncPolicy";
import { createMindMapHydrateCoordinator } from "./mindMapHydrateCoordinator";
import {
  debugMindMapPersist,
  findFirstRichMindMapNodeSummary,
  summarizeMindMapRichTextTree,
} from "./mindMapPersistDebug";
import {
  clearMindMapHostDebugForward,
  forwardMindMapHostDebug,
  installMindMapHostDebugForward,
} from "./mindMapHostDebugForward";
import {
  getCachedMindMapDocument,
  getCachedMindMapServerSha,
  MINDMAP_SAVE_TIMEOUT_MS,
  toMindMapLocalCacheRecord,
  type MindMapNativeSaveResult,
  useMindMapFileSave,
} from "./useMindMapFileSave";

import type { ManagedDocument } from "../../data/documentTypes";
import type { MindMapDocumentData } from "../../data/formats/MindMapAdapter";

import {
  HOME_APP_TITLE,
  useEditorDocumentTitle,
} from "../../lib/appBranding";
import { devDebug } from "../../lib/devDebug";
import { useMindMapNativeAIConfig } from "./useMindMapNativeAIConfig";
import {
  resolveMindMapOpenDisplayName,
  useMindMapRootNameSync,
} from "./useMindMapRootNameSync";
import {
  adoptMindMapNativeBaseline,
  getMindMapModificationState,
  isMindMapNativeDirtyPending,
} from "./mindMapDraftState";
import { useMindMapNativeHydrate } from "./useMindMapNativeHydrate";

import "./MindMapEditorShell.scss";

function debugMindMapOpen(label: string, data?: Record<string, unknown>) {
  devDebug("mindmap-open", label, data);
  forwardMindMapHostDebug("mindmap-open", label, data);
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

function getCachedFileListName(fileId: string): string | null {
  return readFileListTreeCache()?.files.find((file) => file.id === fileId)
    ?.name ?? null;
}

function getClipboardImagePayload(payload: unknown):
  | {
      dataUrl: string;
      type: string;
    }
  | null {
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

async function shouldRefreshMindMapServerThumbnail(
  fileId: string,
  opts: { hasThumbnail?: boolean; contentSha?: string | null },
): Promise<boolean> {
  if (!opts.hasThumbnail) {
    return true;
  }
  const suffix = opts.contentSha
    ? `?h=${encodeURIComponent(opts.contentSha)}`
    : "";
  try {
    const response = await fetch(`/api/files/${fileId}/thumbnail${suffix}`, {
      cache: "no-store",
      headers: { Accept: "image/svg+xml,text/plain,*/*;q=0.8" },
    });
    if (response.status === 404) {
      return true;
    }
    if (!response.ok) {
      return false;
    }
    return isSchematicMindMapThumbnailSvg(await response.text());
  } catch {
    return false;
  }
}

function getMindMapSavePayload(payload: unknown): {
  data: unknown;
  thumbnail: string | null;
  requestId?: string;
  revision?: number;
} {
  if (payload && typeof payload === "object" && "data" in payload) {
    const requestId = (payload as { requestId?: unknown }).requestId;
    const revision = (payload as { revision?: unknown }).revision;
    return {
      data: (payload as { data?: unknown }).data,
      thumbnail: decodeNativeMindMapThumbnail(
        (payload as { thumbnail?: unknown }).thumbnail,
      ),
      requestId: typeof requestId === "string" ? requestId : undefined,
      revision: typeof revision === "number" ? revision : undefined,
    };
  }
  return { data: payload, thumbnail: null };
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
              // Browser clipboard items may expose types that are not readable.
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

const MindMapEditorShell = () => {
  const fileId = getFileIdFromHash();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const {
    bootKey: iframeBootKey,
    bridgePhase,
    bridgeError,
    isAppReady,
    isBridgeReady,
    learnedOrigin,
    publishDocument,
    postToNative,
    onIframeLoad,
    onIframeError,
    handleBridgeLifecycleMessage,
    learnOrigin,
  } = useMindMapHostBridge({
    fileId,
    iframeRef,
    debugOpen: debugMindMapOpen,
  });
  const [status, setStatus] = useState("");

  const logMindMapOpenPhase = useCallback(
    (phase: EditorOpenPhase) => {
      const payload = {
        editor: "mindmap",
        fileId8: fileId?.slice(0, 8) ?? null,
      };
      logEditorOpenPhase(phase, payload);
      forwardMindMapHostDebug("editor-open", phase, payload);
    },
    [fileId],
  );
  const [error, setError] = useState<string | null>(null);
  const displayError = error ?? bridgeError;
  const [fileName, setFileName] = useState(DEFAULT_DOCUMENT_DISPLAY_NAME);
  const lastNativeThumbnailRef = useRef<string | null>(null);
  const [showAISettings, setShowAISettings] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showEmbedManager, setShowEmbedManager] = useState(false);
  const needsInitialThumbnailRef = useRef(false);
  const saveResolveRef = useRef<
    ((result: MindMapNativeSaveResult | null) => void) | null
  >(null);
  const savePromiseRef = useRef<Promise<
    MindMapNativeSaveResult | null
  > | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const saveRequestIdRef = useRef<string | null>(null);
  const latestNativeRevisionRef = useRef(0);
  const latestDocumentRef = useRef<ManagedDocument<MindMapDocumentData> | null>(
    null,
  );
  const hydrateCoordinatorRef = useRef(createMindMapHydrateCoordinator());
  const shellStartRef = useRef(performance.now());
  const initStartRef = useRef<number | null>(null);

  useEditorDocumentTitle(fileId ? fileName : null);

  useEffect(() => {
    debugMindMapOpen("MindMapEditorShell mounted", {
      fileId8: fileId?.slice(0, 8) ?? null,
      sinceShellStart: Math.round(performance.now() - shellStartRef.current),
    });
  }, [fileId]);

  useEffect(() => {
    if (fileId && isLegacyTempFileId(fileId)) {
      window.location.hash = buildViewHash("home");
    }
  }, [fileId]);

  useEffect(() => {
    if (fileId || !isNewDocumentHash()) {
      return;
    }
    const kind = getDocumentKindFromHash();
    void bootstrapLocalDraftSession(kind).then(({ id }) => {
      window.location.hash = editorRegistry.buildFileHash(id, kind);
    });
  }, [fileId]);

  const updateLatestDocument = useCallback(
    (data: MindMapDocumentData): ManagedDocument<MindMapDocumentData> => {
      const document = MindMapAdapter.toDocument(data);
      latestDocumentRef.current = document;
      return document;
    },
    [],
  );

  const postClipboardResult = useCallback(
    (type: string, requestId: string | undefined, payload: unknown) => {
      postToNative(type, {
        requestId,
        ...((payload && typeof payload === "object"
          ? payload
          : {}) as Record<string, unknown>),
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

  const requestNativeSave = useCallback(() => {
    if (savePromiseRef.current) {
      debugMindMapBridge("requestNativeSave | reuse in-flight promise");
      return savePromiseRef.current;
    }
    const bridgeState = describeMindMapBridgeState({
      hostOrigin: window.location.origin,
      iframeSrc: iframeRef.current?.src ?? null,
      bridgeReady: isBridgeReady,
      appInited: isAppReady,
      learnedOrigin,
      hasContentWindow: !!iframeRef.current?.contentWindow,
    });
    debugMindMapBridge("requestNativeSave | start", bridgeState);

    const promise = new Promise<MindMapNativeSaveResult | null>((resolve) => {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      saveResolveRef.current = resolve;
      saveRequestIdRef.current = requestId;
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = window.setTimeout(() => {
        warnMindMapBridge("requestNativeSave | timeout", {
          requestId,
          timeoutMs: MINDMAP_SAVE_TIMEOUT_MS,
          bridgeState: describeMindMapBridgeState({
            hostOrigin: window.location.origin,
            iframeSrc: iframeRef.current?.src ?? null,
            bridgeReady: isBridgeReady,
            appInited: isAppReady,
            learnedOrigin,
            hasContentWindow: !!iframeRef.current?.contentWindow,
          }),
        });
        saveResolveRef.current = null;
        savePromiseRef.current = null;
        saveTimeoutRef.current = null;
        saveRequestIdRef.current = null;
        const hint = !isBridgeReady
          ? "mindmap 原生 iframe 未就绪（请运行 yarn build:production）"
          : !isAppReady
            ? "mindmap 原生界面未完成初始化"
            : "mindmap 原生界面未响应保存请求";
        setError(hint);
        resolve(null);
      }, MINDMAP_SAVE_TIMEOUT_MS);

      if (!isAppReady) {
        warnMindMapBridge("requestNativeSave | app not inited yet", {
          requestId,
          bridgeState,
        });
      }

      const posted = postToNative("requestMindMapSave", { requestId });
      if (!posted) {
        warnMindMapBridge("requestNativeSave | postMessage not sent", {
          requestId,
          bridgeState,
        });
        if (saveTimeoutRef.current) {
          window.clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        saveResolveRef.current = null;
        savePromiseRef.current = null;
        saveRequestIdRef.current = null;
        resolve(null);
        return;
      }
    });
    savePromiseRef.current = promise;
    return promise;
  }, [isAppReady, isBridgeReady, learnedOrigin, postToNative]);

  const navigateToFileListHomeRef = useRef(() => {});
  const navigateToFileListHome = useCallback(() => {
    navigateToFileListHomeRef.current();
  }, []);

  const mindMapSaveRef = useRef<{
    persistLocalDraftToCache: (forcedFileId?: string) => Promise<boolean>;
    flushDraftDebounce: () => void;
  } | null>(null);

  const localDraftLoss = useLocalDraftLossConfirm({
    getFileId: getFileIdFromHash,
  });

  const saveNewDoc = useSaveNewDocumentDialog({
    getFileId: () => fileId,
    getDocumentKind: getDocumentKindFromHash,
    getDefaultName: () => fileName,
    getMindMapDocument: () => latestDocumentRef.current,
    getMindMapThumbnail: () => lastNativeThumbnailRef.current,
    beforeSave: async () => {
      mindMapSaveRef.current?.flushDraftDebounce();
      const nativeSave = await requestNativeSave();
      lastNativeThumbnailRef.current = nativeSave?.thumbnail ?? null;
      if (nativeSave?.document) {
        latestDocumentRef.current = nativeSave.document;
      }
    },
    navigateHome: navigateToFileListHome,
    setErrorMessage: setError,
  });

  const {
    mindMapSaving,
    mindMapSaveHint,
    mindMapHomeNavDialogOpen,
    markDocumentChanged,
    markNativeDocumentDirty,
    persistLocalDraftToCache,
    saveCurrentFileToServer,
    saveAndArchiveCurrentVersion,
    mindMapGoHomeWithServerSave,
    mindMapHomeConfirmSave,
    mindMapHomeConfirmDiscard,
    mindMapHomeDismissDialog,
    saveToServerRef,
    skipLeaveStashOnceRef,
    updateDraftHashDebouncedRef,
  } = useMindMapFileSave({
    getCurrentDocument: () => latestDocumentRef.current,
    requestNativeMindMapData: requestNativeSave,
    getFileName: () => fileName,
    navigateToFileListHome,
    setErrorMessage: setError,
    setStatus,
    onRequestSaveNew: ({ navigateAfter }) => {
      saveNewDoc.openSaveDialog(navigateAfter);
    },
  });

  mindMapSaveRef.current = {
    persistLocalDraftToCache,
    flushDraftDebounce: () => updateDraftHashDebouncedRef.current.flush(),
  };

  useEffect(() => {
    navigateToFileListHomeRef.current = () => {
      skipLeaveStashOnceRef.current = true;
      window.location.hash = buildViewHash("home");
      window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
    };
  }, [skipLeaveStashOnceRef]);

  useMindMapNativeAIConfig({ isBridgeReady, postToNative });

  const {
    initSyncedText,
    onDocumentChanged: syncRootTextToFileName,
    syncFileNameToRootIfNeeded,
  } = useMindMapRootNameSync({
    fileId,
    setFileName,
    isBridgeReady,
    postToNative,
  });

  const noteOpenHydrateSession = useCallback(
    (document: ManagedDocument<MindMapDocumentData>) => {
      const session = hydrateCoordinatorRef.current.beginSession(document);
      debugMindMapPersist("open hydrate session anchored", {
        fileId8: fileId?.slice(0, 8) ?? null,
        contentHash8: session.anchor.contentHash.slice(0, 8),
        richText: session.anchor.richText,
      });
    },
    [fileId],
  );

  const onNativeHydrateSettleEnd = useCallback(() => {
    const latest = latestDocumentRef.current;
    if (!latest || !fileId) {
      return;
    }
    const baselineDocument = hydrateCoordinatorRef.current.settle(latest);
    latestDocumentRef.current = baselineDocument;
    adoptMindMapNativeBaseline(fileId, baselineDocument);
    setStatus("");
    debugMindMapPersist("native hydrate settle aligned", {
      fileId8: fileId.slice(0, 8),
      usedAnchorDocument:
        hashDocumentSnapshot(baselineDocument) !==
        hashDocumentSnapshot(latest),
      richText: summarizeMindMapRichTextTree(baselineDocument.data),
    });
    const synced = syncFileNameToRootIfNeeded(fileName, baselineDocument.data);
    if (synced) {
      debugMindMapOpen("reconciled root title and file display name on settle", {
        fileName,
      });
    }
  }, [fileId, fileName, setStatus, syncFileNameToRootIfNeeded]);

  const {
    isHydratingRef: nativeHydratingRef,
    extendSettle: extendNativeHydrateSettle,
    dispose: disposeNativeHydrate,
  } = useMindMapNativeHydrate({
    onSettleEnd: onNativeHydrateSettleEnd,
    onSettleExtended: (reason) =>
      debugMindMapOpen("native hydrate settle extended", { reason }),
    onSettleComplete: (reason) =>
      debugMindMapOpen("native hydrate settle end", { reason }),
  });

  const publishMindMapDataToNative = useCallback(
    (data: MindMapDocumentData, reason: string) => {
      extendNativeHydrateSettle(`publish:${reason}`);
      const authoritativeDocument =
        latestDocumentRef.current ?? MindMapAdapter.toDocument(data);
      noteOpenHydrateSession(authoritativeDocument);
      debugMindMapPersist("publishMindMapDataToNative", {
        reason,
        fileId8: fileId?.slice(0, 8) ?? null,
        rootChildren: data.root?.children?.length ?? 0,
        richText: summarizeMindMapRichTextTree(data),
        sampleNode: findFirstRichMindMapNodeSummary(data),
      });
      publishDocument(toNativeMindMapBridgePayload(data, fileId), reason);
    },
    [extendNativeHydrateSettle, fileId, noteOpenHydrateSession, publishDocument],
  );

  useEffect(() => {
    installMindMapHostDebugForward(postToNative);
    return () => {
      clearMindMapHostDebugForward();
    };
  }, [postToNative]);

  useEffect(() => {
    if (!isBridgeReady) {
      return;
    }
    postToNative("mindMapHostSaveStatus", {
      saving: mindMapSaving,
      hint: mindMapSaveHint,
    });
  }, [isBridgeReady, mindMapSaveHint, mindMapSaving, postToNative]);

  useEffect(() => {
    let disposed = false;

    async function init() {
      resetEditorOpenPhaseLog();
      hydrateCoordinatorRef.current.reset();
      logMindMapOpenPhase("resolving");
      if (!fileId) {
        setError("缺少 mindmap 文件");
        return;
      }

      try {
        initStartRef.current = performance.now();

        if (isLocalDraftFileId(fileId)) {
          const cached = getCachedMindMapDocument(fileId);
          const document =
            cached ?? MindMapAdapter.toDocument(MindMapAdapter.createEmpty());
          const data = document.data;
          if (
            isMindMapSingleRootOnly(document) &&
            !readMindMapBrowserView(fileId)
          ) {
            clearMindMapBrowserView(fileId);
          }
          setFileName(
            resolveMindMapOpenDisplayName(
              data,
              LocalDraftSessions.get(fileId)?.name ?? null,
            ),
          );
          const localDraftName =
            LocalDraftSessions.get(fileId)?.name ??
            DEFAULT_DOCUMENT_DISPLAY_NAME;
          syncFileNameToRootIfNeeded(
            localDraftName,
            data,
          );
          initSyncedText(data);
          latestDocumentRef.current = document;
          logMindMapOpenPhase("preparing_surface");
          publishMindMapDataToNative(data, "local-draft");
          return;
        }

        debugMindMapOpen("init start", {
          fileId8: fileId.slice(0, 8),
        });

        const resolvedId = fileId;
        const cached = getCachedMindMapDocument(resolvedId);
        const hasUnsavedChanges = FileSyncState.hasUnsavedChanges(resolvedId);

        const loadFromServer = async (reason: string) => {
          const serverStart = performance.now();
          debugMindMapOpen("before ServerSync.getFile", {
            fileId8: resolvedId.slice(0, 8),
            reason,
          });
          const serverFile = await ServerSync.getFile(resolvedId);
          debugMindMapOpen("after ServerSync.getFile", {
            fileId8: resolvedId.slice(0, 8),
            reason,
            elapsed: Math.round(performance.now() - serverStart),
            hasData: !!serverFile.data,
            hasThumbnail: !!serverFile.has_thumbnail,
            kind: serverFile.kind,
          });
          if (disposed) {
            return;
          }

          needsInitialThumbnailRef.current =
            await shouldRefreshMindMapServerThumbnail(resolvedId, {
              hasThumbnail: serverFile.has_thumbnail,
              contentSha: serverFile.content_sha256,
            });
          const parseStart = performance.now();
          saveMindMapBrowserViewFromData(resolvedId, serverFile.data);
          const data = serverFile.data
            ? await MindMapAdapter.parse(serverFile.data)
            : createEmptyMindMapData(
                serverFile.name || DEFAULT_DOCUMENT_DISPLAY_NAME,
              );
          setFileName(
            resolveMindMapOpenDisplayName(
              data,
              serverFile.name || null,
            ),
          );
          syncFileNameToRootIfNeeded(
            serverFile.name || DEFAULT_DOCUMENT_DISPLAY_NAME,
            data,
          );
          debugMindMapOpen("after MindMapAdapter.parse", {
            elapsed: Math.round(performance.now() - parseStart),
            rootChildren: data.root?.children?.length ?? 0,
            reason,
          });
          const document = MindMapAdapter.toDocument(data);
          if (
            isMindMapSingleRootOnly(document) &&
            !readMindMapBrowserView(resolvedId)
          ) {
            clearMindMapBrowserView(resolvedId);
          }
          latestDocumentRef.current = document;
          initSyncedText(data);
          recordMindMapPersisted(resolvedId, document, {
            serverContentSha256: serverFile.content_sha256 ?? undefined,
          });
          debugMindMapPersist("loadFromServer prepared", {
            fileId8: resolvedId.slice(0, 8),
            reason,
            serverSha8: serverFile.content_sha256?.slice(0, 8) ?? null,
            sampleNode: findFirstRichMindMapNodeSummary(data),
          });
          debugMindMapOpen("server payload prepared", {
            fileId8: resolvedId.slice(0, 8),
            totalElapsed: Math.round(
              performance.now() - (initStartRef.current ?? performance.now()),
            ),
            reason,
          });
          logMindMapOpenPhase("preparing_surface");
          publishMindMapDataToNative(data, reason);
        };

        if (
          shouldOpenCachedDocumentFirst({ hasCachedDocument: !!cached }) &&
          cached
        ) {
          setFileName(
            resolveMindMapOpenDisplayName(
              cached.data,
              getCachedFileListName(resolvedId),
            ),
          );
          syncFileNameToRootIfNeeded(
            getCachedFileListName(resolvedId) ?? DEFAULT_DOCUMENT_DISPLAY_NAME,
            cached.data,
          );
          latestDocumentRef.current = cached;
          initSyncedText(cached.data);
          debugMindMapOpen("cache payload prepared", {
            fileId8: resolvedId.slice(0, 8),
            totalElapsed: Math.round(
              performance.now() - (initStartRef.current ?? performance.now()),
            ),
            hasUnsavedChanges,
            rootChildren: cached.data.root?.children?.length ?? 0,
            sampleNode: findFirstRichMindMapNodeSummary(cached.data),
          });
          logMindMapOpenPhase(
            hasUnsavedChanges ? "restoring_draft" : "checking_remote",
          );
          publishMindMapDataToNative(cached.data, "cache-first");

          try {
            const hashStart = performance.now();
            const hashes = await ServerSync.listFileHashes();
            const remoteHash =
              hashes.find((entry) => entry.id === resolvedId)?.content_sha256 ??
              null;
            debugMindMapOpen("after ServerSync.listFileHashes", {
              fileId8: resolvedId.slice(0, 8),
              elapsed: Math.round(performance.now() - hashStart),
              remoteHash8: remoteHash?.slice(0, 8) ?? null,
              localServerHash8:
                FileSyncState.getServerHash(resolvedId)?.slice(0, 8) ?? null,
              hasUnsavedChanges,
            });
            if (disposed) {
              return;
            }
            const refreshDecision = explainRefreshCacheOnOpen({
              hasUnsavedChanges,
              localServerHash: FileSyncState.getServerHash(resolvedId),
              remoteServerHash: remoteHash,
              cachedServerSha: getCachedMindMapServerSha(resolvedId),
            });
            debugMindMapPersist("open cache sync decision", {
              fileId8: resolvedId.slice(0, 8),
              reason: refreshDecision.reason,
              refresh: refreshDecision.refresh,
              remoteHash8: remoteHash?.slice(0, 8) ?? null,
              localServerHash8:
                FileSyncState.getServerHash(resolvedId)?.slice(0, 8) ?? null,
              cachedServerSha8:
                getCachedMindMapServerSha(resolvedId)?.slice(0, 8) ?? null,
              cacheSample: findFirstRichMindMapNodeSummary(cached.data),
            });
            if (refreshDecision.refresh) {
              logMindMapOpenPhase("background_sync");
              await loadFromServer("remote-hash-changed-after-cache");
              logMindMapOpenPhase("ready");
              return;
            }
            if (remoteHash) {
              FileSyncState.setServerHash(resolvedId, remoteHash);
            }
            logMindMapOpenPhase("ready");
            return;
          } catch (err: any) {
            debugMindMapOpen("listFileHashes after cache failed", {
              message: err?.message || String(err),
            });
            logMindMapOpenPhase("ready");
            return;
          }
        }

        logMindMapOpenPhase("loading_remote");
        await loadFromServer("no-cache");
        logMindMapOpenPhase("ready");
      } catch (err: any) {
        warnMindMapBridge("init failed", {
          message: err?.message || String(err),
          stack: err?.stack,
          fileId8: fileId?.slice(0, 8) ?? null,
        });
        debugMindMapOpen("init error", {
          message: err?.message || String(err),
          stack: err?.stack,
        });
        setError(err?.message || "mindmap 打开失败");
      }
    }

    void init();

    return () => {
      disposed = true;
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      disposeNativeHydrate();
      saveResolveRef.current = null;
      savePromiseRef.current = null;
    };
  }, [
    disposeNativeHydrate,
    fileId,
    logMindMapOpenPhase,
    publishMindMapDataToNative,
  ]);

  useEffect(() => {
    if (!fileId) {
      return;
    }
    const onMessage = (event: MessageEvent<unknown>) => {
      const iframeSrc = iframeRef.current?.src ?? null;
      if (
        !isAllowedNativeMindMapMessageOrigin(event.origin, {
          hostOrigin: window.location.origin,
          iframeSrc,
          learnedOrigin,
        })
      ) {
        debugMindMapBridge("onMessage | rejected origin", {
          origin: event.origin,
          type:
            event.data &&
            typeof event.data === "object" &&
            typeof (event.data as { type?: unknown }).type === "string"
              ? (event.data as { type: string }).type
              : null,
          iframeSrc,
          allowed: describeMindMapBridgeState({
            hostOrigin: window.location.origin,
            iframeSrc,
            bridgeReady: isBridgeReady,
            appInited: isAppReady,
            learnedOrigin,
            hasContentWindow: !!iframeRef.current?.contentWindow,
          }),
        });
        return;
      }
      if (!isNativeMindMapMessage(event.data)) {
        return;
      }
      learnOrigin(event.origin);
      debugMindMapBridge(`onMessage ${event.data.type}`, {
        origin: event.origin,
        hasPayload: event.data.payload != null,
      });
      if (
        event.data.type === "CLIPBOARD_WRITE_TEXT" ||
        event.data.type === "CLIPBOARD_READ_TEXT" ||
        event.data.type === "CLIPBOARD_READ" ||
        event.data.type === "CLIPBOARD_WRITE_IMAGE"
      ) {
        void handleNativeClipboardMessage(event.data);
        return;
      }
      if (
        handleBridgeLifecycleMessage(event.data, event.origin) &&
        (event.data.type === "mindMapIframeError" ||
          event.data.type === "ready" ||
          event.data.type === "appInited")
      ) {
        if (event.data.type === "appInited") {
          extendNativeHydrateSettle("appInited");
          debugMindMapOpen("request draft thumbnail export");
          postToNative("hostExportDraftThumbnail", {});
          if (
            needsInitialThumbnailRef.current &&
            fileId &&
            !isLocalDraftFileId(fileId)
          ) {
            needsInitialThumbnailRef.current = false;
            debugMindMapOpen("trigger initial thumbnail save");
            requestSave({
              source: "thumbnail",
              forceThumbnail: true,
            });
          } else {
            needsInitialThumbnailRef.current = false;
          }
        }
        return;
      }
      if (event.data.type === "hostBackToFiles") {
        void mindMapGoHomeWithServerSave();
        return;
      }
      if (event.data.type === "hostOpenEmbedManager") {
        if (!fileId || isLocalDraftFileId(fileId)) {
          return;
        }
        setShowEmbedManager(true);
        return;
      }
      if (event.data.type === "hostOpenAISettings") {
        setShowAISettings(true);
        return;
      }
      if (event.data.type === "hostOpenHistory") {
        if (!fileId || isLocalDraftFileId(fileId)) {
          return;
        }
        setShowHistoryPanel((value) => !value);
        return;
      }
      if (event.data.type === "hostRequestSave") {
        requestSave({ source: "hotkey" });
        return;
      }
      if (event.data.type === "saveMindMapData") {
        const savePayload = getMindMapSavePayload(event.data.payload);
        const isCurrentSaveResponse =
          !!saveResolveRef.current &&
          !!savePayload.requestId &&
          savePayload.requestId === saveRequestIdRef.current;
        debugMindMapBridge("saveMindMapData", {
          isCurrentSaveResponse,
          requestId: savePayload.requestId ?? null,
          revision: savePayload.revision ?? null,
          hasThumbnail: !!savePayload.thumbnail,
        });
        debugMindMapPersist("received saveMindMapData from iframe", {
          isCurrentSaveResponse,
          requestId: savePayload.requestId ?? null,
          revision: savePayload.revision ?? null,
          hydrating: nativeHydratingRef.current,
          fileId8: fileId?.slice(0, 8) ?? null,
        });
        if (
          savePayload.requestId &&
          savePayload.requestId !== saveRequestIdRef.current
        ) {
          return;
        }
        if (
          !isCurrentSaveResponse &&
          savePayload.revision !== undefined &&
          savePayload.revision < latestNativeRevisionRef.current
        ) {
          return;
        }
        const previousDocument = latestDocumentRef.current;
        if (
          !isCurrentSaveResponse &&
          isEffectivelyEmptyMindMapData(savePayload.data) &&
          previousDocument &&
          !isEffectivelyEmptyMindMapData(previousDocument.data)
        ) {
          if (savePayload.revision !== undefined) {
            latestNativeRevisionRef.current = savePayload.revision;
          }
          debugMindMapOpen("skip transient empty saveMindMapData", {
            requestId: savePayload.requestId ?? null,
            revision: savePayload.revision ?? null,
            previousRootChildren:
              previousDocument.data.root.children?.length ?? 0,
          });
          return;
        }
        void MindMapAdapter.parse(savePayload.data)
          .then((parsedData) => {
            if (savePayload.revision !== undefined) {
              latestNativeRevisionRef.current = savePayload.revision;
            }
            const parsedDocument = MindMapAdapter.toDocument(parsedData);
            const draftResult = hydrateCoordinatorRef.current.handleDraftPush(
              parsedDocument,
              latestDocumentRef.current,
              {
                isSaveResponse: isCurrentSaveResponse,
                hydrating: nativeHydratingRef.current,
              },
            );
            const { document, decision: hydrateDecision } = draftResult;
            latestDocumentRef.current = document;
            debugMindMapPersist("saveMindMapData parsed", {
              isCurrentSaveResponse,
              revision: savePayload.revision ?? null,
              fileId8: fileId?.slice(0, 8) ?? null,
              hydrateDecision: hydrateDecision.reason,
              adoptBaseline: hydrateDecision.adoptBaseline,
              updateHostDocument: hydrateDecision.updateHostDocument,
              richText: summarizeMindMapRichTextTree(parsedData),
              sampleNode: findFirstRichMindMapNodeSummary(parsedData),
            });
            if (savePayload.thumbnail) {
              LocalThumbnailCache.set(fileId, savePayload.thumbnail);
            }
            if (isCurrentSaveResponse && saveResolveRef.current) {
              const resolve = saveResolveRef.current;
              saveResolveRef.current = null;
              savePromiseRef.current = null;
              saveRequestIdRef.current = null;
              if (saveTimeoutRef.current) {
                window.clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
              }
              resolve({
                document,
                thumbnail: savePayload.thumbnail,
              });
            } else if (draftResult.shouldExtendSettle) {
              extendNativeHydrateSettle("draft-push");
              const hasUserDirtyPending =
                fileId && isMindMapNativeDirtyPending(fileId);
              if (
                fileId &&
                draftResult.shouldAdoptBaseline &&
                !hasUserDirtyPending
              ) {
                adoptMindMapNativeBaseline(fileId, document);
                setStatus("");
                debugMindMapPersist("hydrate draft adopted", {
                  revision: savePayload.revision ?? null,
                  fileId8: fileId.slice(0, 8),
                  reason: hydrateDecision.reason,
                });
              } else if (fileId) {
                debugMindMapPersist("hydrate draft rejected", {
                  revision: savePayload.revision ?? null,
                  fileId8: fileId.slice(0, 8),
                  reason: hydrateDecision.reason,
                  nativeDirtyPending: hasUserDirtyPending,
                });
              }
            } else if (draftResult.shouldMarkChanged) {
              markDocumentChanged(document);
            }
            syncRootTextToFileName(document.data);
            setError(null);
          })
          .catch((err: any) => {
            if (saveResolveRef.current) {
              saveResolveRef.current(null);
              saveResolveRef.current = null;
              savePromiseRef.current = null;
              saveRequestIdRef.current = null;
              if (saveTimeoutRef.current) {
                window.clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
              }
            }
            debugMindMapOpen("saveMindMapData parse failed", {
              isCurrentSaveResponse,
              requestId: savePayload.requestId ?? null,
              revision: savePayload.revision ?? null,
              message: err?.message || String(err),
              stack: err?.stack,
            });
            if (isCurrentSaveResponse) {
              setError(err?.message || "mindmap 数据保存失败");
            }
          });
        return;
      }
      if (event.data.type === "saveMindMapThumbnail") {
        const payload = event.data.payload;
        if (!payload || typeof payload !== "object") {
          return;
        }
        const revision = (payload as { revision?: unknown }).revision;
        if (
          typeof revision === "number" &&
          revision < latestNativeRevisionRef.current
        ) {
          return;
        }
        const thumbnail = decodeNativeMindMapThumbnail(
          (payload as { thumbnail?: unknown }).thumbnail,
        );
        if (thumbnail && fileId) {
          LocalThumbnailCache.set(fileId, thumbnail);
        }
        return;
      }
      if (event.data.type === "mindMapViewState") {
        saveMindMapBrowserView(fileId, event.data.payload);
        return;
      }
      if (event.data.type === "mindMapDirtyState") {
        const isUserEdit =
          event.data.payload &&
          typeof event.data.payload === "object" &&
          (event.data.payload as { userEdit?: unknown }).userEdit === true;
        if (nativeHydratingRef.current && !isUserEdit) {
          debugMindMapOpen("mindMapDirtyState suppressed during hydrate");
          return;
        }
        markNativeDocumentDirty();
        return;
      }
      const current = latestDocumentRef.current;
      if (!current) {
        return;
      }
      // hydrate 期间 iframe 初始化会程序化推送 config/lang，与 mindMapDirtyState
      // 同样不应标脏（否则误亮红点并武装空闲自动保存）；settle 时由 anchor 决议对齐。
      const markChangedUnlessHydrating = (type: string) => {
        if (nativeHydratingRef.current) {
          debugMindMapPersist("config change suppressed during hydrate", {
            type,
          });
          return;
        }
        markDocumentChanged(latestDocumentRef.current!);
      };
      if (event.data.type === "saveMindMapConfig") {
        // iframe 回传的是运行时 config（含宿主注入的媒体限制等键），入口处即
        // compact：内存文档只保留用户显式且非默认的值。若不在此清理，运行时键
        // 会先被 toDocument 剥掉、破坏 migrate 修复遗留 0 所依赖的污染指纹。
        updateLatestDocument({
          ...current.data,
          config: compactMindMapPersistedConfig(
            event.data.payload &&
              typeof event.data.payload === "object" &&
              !Array.isArray(event.data.payload)
              ? (event.data.payload as Record<string, unknown>)
              : undefined,
          ),
        });
        markChangedUnlessHydrating(event.data.type);
        return;
      }
      if (event.data.type === "saveLocalConfig") {
        updateLatestDocument({
          ...current.data,
          localConfig:
            event.data.payload &&
            typeof event.data.payload === "object" &&
            !Array.isArray(event.data.payload)
              ? (event.data.payload as Record<string, unknown>)
              : null,
        });
        markChangedUnlessHydrating(event.data.type);
        return;
      }
      if (event.data.type === "saveLanguage") {
        try {
          updateLatestDocument({
            ...current.data,
            lang:
              typeof event.data.payload === "string"
                ? event.data.payload
                : "zh",
          });
          markChangedUnlessHydrating(event.data.type);
        } catch (err: any) {
          setError(err?.message || "mindmap 数据保存失败");
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [
    extendNativeHydrateSettle,
    fileId,
    handleBridgeLifecycleMessage,
    handleNativeClipboardMessage,
    isAppReady,
    isBridgeReady,
    learnOrigin,
    learnedOrigin,
    markDocumentChanged,
    markNativeDocumentDirty,
    mindMapGoHomeWithServerSave,
    postToNative,
    requestNativeSave,
    saveCurrentFileToServer,
    setStatus,
    updateLatestDocument,
  ]);

  const reloadMindMapFromServer = useCallback(async (opts?: {
    reason?: string;
    status?: string;
  }) => {
    if (!fileId) {
      return;
    }
    const serverFile = await ServerSync.getFile(fileId, { force: true });
    saveMindMapBrowserViewFromData(fileId, serverFile.data);
    const data = serverFile.data
      ? await MindMapAdapter.parse(serverFile.data)
      : createEmptyMindMapData(
          serverFile.name || DEFAULT_DOCUMENT_DISPLAY_NAME,
        );
    const document = MindMapAdapter.toDocument(data);
    latestDocumentRef.current = document;
    publishMindMapDataToNative(data, opts?.reason ?? "history-restore");
    recordMindMapPersisted(fileId, document, {
      serverContentSha256: serverFile.content_sha256 ?? undefined,
    });
    setFileName(resolveMindMapOpenDisplayName(data, serverFile.name || null));
    syncFileNameToRootIfNeeded(
      serverFile.name || DEFAULT_DOCUMENT_DISPLAY_NAME,
      data,
    );
    needsInitialThumbnailRef.current = await shouldRefreshMindMapServerThumbnail(
      fileId,
      {
        hasThumbnail: serverFile.has_thumbnail,
        contentSha: serverFile.content_sha256,
      },
    );
    setStatus(opts?.status ?? "已恢复历史版本");
    setError(null);
    window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
    window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
  }, [fileId, publishMindMapDataToNative, syncFileNameToRootIfNeeded]);

  const reloadFromCrossTabSave = useCallback(
    () =>
      reloadMindMapFromServer({
        reason: "cross-tab-file-saved",
        status: "已同步远端更新",
      }),
    [reloadMindMapFromServer],
  );
  const remoteRefresh = useRemoteFileRefresh({
    fileId,
    reload: reloadFromCrossTabSave,
  });

  useEffect(() => {
    const onSave = (requestId?: string) =>
      requestSave({ source: "sidebar", requestId });
    const onExport = () => {
      postToNative("mindMapHostOpenExport");
    };
    const onImport = () => {
      postToNative("mindMapHostOpenImport");
    };
    const onHistory = () => {
      if (!fileId) {
        return;
      }
      setShowHistoryPanel(true);
    };
    const onEmbed = () => {
      if (!fileId || isLocalDraftFileId(fileId)) {
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
      void mindMapGoHomeWithServerSave();
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
    window.addEventListener("mindmap-host-request-save", onLegacySave);
    window.addEventListener("mindmap-host-open-export", onExport);
    window.addEventListener("mindmap-host-open-import", onImport);
    window.addEventListener("mindmap-host-open-history", onHistory);
    window.addEventListener("mindmap-host-open-embed", onEmbed);
    window.addEventListener(APP_SHELL_GO_HOME, onShellGoHome);
    return () => {
      window.removeEventListener(EDITOR_HOST_COMMAND_EVENT, onHostCommand);
      window.removeEventListener("mindmap-host-request-save", onLegacySave);
      window.removeEventListener("mindmap-host-open-export", onExport);
      window.removeEventListener("mindmap-host-open-import", onImport);
      window.removeEventListener("mindmap-host-open-history", onHistory);
      window.removeEventListener("mindmap-host-open-embed", onEmbed);
      window.removeEventListener(APP_SHELL_GO_HOME, onShellGoHome);
    };
  }, [
    fileId,
    mindMapGoHomeWithServerSave,
    postToNative,
    saveToServerRef,
    skipLeaveStashOnceRef,
  ]);

  useEffect(() => {
    if (!fileId) {
      return;
    }
    const onHashLeave = (event: HashChangeEvent) => {
      const nextHash = new URL(event.newURL).hash;
      if (nextHash.includes(fileId)) {
        return;
      }
      if (skipLeaveStashOnceRef.current) {
        skipLeaveStashOnceRef.current = false;
        return;
      }
      void persistLocalDraftToCache(fileId);
    };
    window.addEventListener("hashchange", onHashLeave);
    return () => window.removeEventListener("hashchange", onHashLeave);
  }, [fileId, persistLocalDraftToCache, skipLeaveStashOnceRef]);

  useEffect(() => {
    const onBeforeUnload = () => {
      if (!fileId || !latestDocumentRef.current) {
        return;
      }
      if (isMindMapNativeDirtyPending(fileId)) {
        FileSyncState.setLocalEditTime(fileId);
        return;
      }
      const state = getMindMapModificationState(
        fileId,
        latestDocumentRef.current,
      );
      const hash =
        state.modified
          ? (state.contentHash ?? hashDocumentSnapshot(latestDocumentRef.current))
          : (state.baselineHash ??
            state.contentHash ??
            hashDocumentSnapshot(latestDocumentRef.current));
      FileSyncState.setDraftHash(fileId, hash);
      if (state.modified) {
        // 经 toMindMapLocalCacheRecord 规范化（migrate 修复 + toDocument compact），
        // 避免把内存里的原始 config 裸写进缓存、绕过持久化边界
        FileSyncState.setLocalCache(
          fileId,
          toMindMapLocalCacheRecord(latestDocumentRef.current),
        );
        if (state.shouldMarkLocalDraftEdited) {
          notifyLocalDraftEdited(fileId, fileName);
        }
        return;
      }
      FileSyncState.clearLocalEditTime(fileId);
      if (isLocalDraftFileId(fileId)) {
        FileSyncState.clearLocalCache(fileId);
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [fileId]);

  useEffect(() => {
    // hydrate settle 前画布数据尚未达到权威状态（iframe 初始化可能产出
    // 与基线不符的程序化快照），自动上行会把它写到服务器覆盖正确版本。
    const requestAutoSave = () => {
      if (nativeHydratingRef.current) {
        debugMindMapPersist("auto save suppressed during hydrate", {
          source: "auto",
        });
        return;
      }
      requestSave({ source: "auto" });
    };

    const unregisterAutoSave = registerAutoSaveTrigger(() => {
      if (!isAutoSaveEligibleForCurrentFile()) {
        return;
      }
      requestAutoSave();
    });

    return () => {
      unregisterAutoSave();
    };
  }, [saveToServerRef]);

  useEffect(() => {
    if (!isAppReady) {
      return;
    }
    logMindMapOpenPhase("ready");
    debugMindMapOpen("load complete summary", {
      fileId8: fileId?.slice(0, 8) ?? null,
      sinceShellStart: Math.round(performance.now() - shellStartRef.current),
      sinceInitStart:
        initStartRef.current != null
          ? Math.round(performance.now() - initStartRef.current)
          : null,
      bridgePhase,
      isBridgeReady,
      isAppReady,
    });
  }, [bridgePhase, fileId, isAppReady, isBridgeReady, logMindMapOpenPhase]);

  return (
    <main className="mindmap-editor">
      {displayError ? (
        <section className="mindmap-editor__error">
          <strong>mindmap 打开失败</strong>
          <span>{displayError}</span>
        </section>
      ) : null}
      <iframe
        ref={iframeRef}
        key={`${fileId ?? "none"}-${iframeBootKey}`}
        title={HOME_APP_TITLE}
        className="mindmap-editor__native-frame"
        src={NATIVE_MINDMAP_URL}
        allow="clipboard-read; clipboard-write"
        onLoad={onIframeLoad}
        onError={onIframeError}
      />
      {fileId && (
        <EmbedTokenManager
          fileId={fileId}
          fileName={fileName}
          open={showEmbedManager}
          onClose={() => setShowEmbedManager(false)}
        />
      )}
      <SettingsPanel
        open={showAISettings}
        onClose={() => setShowAISettings(false)}
      />
      {fileId && showHistoryPanel ? (
        <ArchivePanel
          fileId={fileId}
          saving={mindMapSaving}
          onSave={() => requestSaveAndWait({ source: "sidebar" })}
          onArchive={saveAndArchiveCurrentVersion}
          readCurrentModificationState={() => {
            updateDraftHashDebouncedRef.current.flush();
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
            await reloadMindMapFromServer();
          }}
          onClose={() => setShowHistoryPanel(false)}
        />
      ) : null}
      {mindMapHomeNavDialogOpen && fileId ? (
        <div
          className="fork-home-dialog-overlay"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              mindMapHomeDismissDialog();
            }
          }}
        >
          <div
            className="fork-home-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mindmap-home-nav-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="mindmap-home-nav-title">主页</h3>
            <p className="fork-home-dialog-desc">
              {saveNewDoc.isLocalDraftOpen()
                ? "这是尚未保存的临时文档，离开前是否先保存到服务器？不保存将丢失本机草稿。"
                : "当前 mindmap 有未保存的修改，是否先保存？"}
            </p>
            <div className="fork-home-dialog-actions">
              <button
                type="button"
                className="fork-home-btn fork-home-btn--primary"
                disabled={mindMapSaving}
                onClick={() => {
                  if (saveNewDoc.isLocalDraftOpen()) {
                    mindMapHomeDismissDialog();
                    saveNewDoc.openSaveDialog(true);
                    return;
                  }
                  void mindMapHomeConfirmSave();
                }}
              >
                保存并返回
              </button>
              <button
                type="button"
                className="fork-home-btn fork-home-btn--danger"
                disabled={mindMapSaving}
                onClick={() => {
                  if (saveNewDoc.isLocalDraftOpen()) {
                    mindMapHomeDismissDialog();
                    localDraftLoss.requestConfirm(() => {
                      skipLeaveStashOnceRef.current = true;
                      navigateToFileListHome();
                    });
                    return;
                  }
                  void mindMapHomeConfirmDiscard();
                }}
              >
                不保存，放弃修改并返回
              </button>
            </div>
            <button
              type="button"
              className="fork-home-dialog-cancel"
              disabled={mindMapSaving}
              onClick={mindMapHomeDismissDialog}
            >
              取消，继续编辑
            </button>
          </div>
        </div>
      ) : null}
      <LocalDraftLossConfirmDialog
        open={localDraftLoss.open}
        documentName={localDraftLoss.documentName}
        busy={mindMapSaving}
        onConfirm={() => void localDraftLoss.confirmLoss()}
        onCancel={localDraftLoss.dismiss}
      />
      <RemoteUpdateConfirmDialog
        open={remoteRefresh.promptOpen}
        documentName={fileName}
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
    </main>
  );
};

export default MindMapEditorShell;
