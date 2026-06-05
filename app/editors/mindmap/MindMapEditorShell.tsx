import { useCallback, useEffect, useRef, useState } from "react";

import { getAppSettings } from "../../data/appSettings";
import { registerAutoSaveTrigger } from "../../data/autoSaveSession";
import { requestSave } from "../../data/saveQueue";
import { SettingsPanel } from "../../components/SettingsPanel";
import { ArchivePanel } from "../../components/ArchivePanel";
import {
  applyAppShellPendingNavigation,
  type AppShellNavigateDetail,
} from "../../shell/appShellNavigate";
import { APP_SHELL_GO_HOME } from "../../shell/Sidebar";
import { buildViewHash } from "../../shell/useAppView";
import { EmbedTokenManager } from "../../components/EmbedTokenManager";
import { LocalDraftLossConfirmDialog } from "../../components/LocalDraftLossConfirmDialog";
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
import { evaluateCurrentFileModificationState } from "../../data/fileModificationState";
import { readFileListTreeCache } from "../../data/fileListSessionCache";
import { getFileIdFromHash } from "../../data/fileIdFromHash";
import { LocalThumbnailCache } from "../../data/localThumbnailCache";
import {
  isEffectivelyEmptyMindMapData,
  isMindMapSingleRootOnly,
} from "../../data/formats/MindMapAdapter";
import { MindMapAdapter } from "../../data/formats/registry";
import {
  applyMindMapBrowserView,
  clearMindMapBrowserView,
  saveMindMapBrowserView,
  saveMindMapBrowserViewFromData,
} from "../../data/mindMapBrowserViewStorage";
import {
  logEditorOpenPhase,
  resetEditorOpenPhaseLog,
  shouldFetchServerAfterCachedOpen,
  shouldOpenCachedDocumentFirst,
  type EditorOpenPhase,
} from "../../lib/editorOpenPhases";
import { hashDocumentSnapshot } from "../../data/sceneHash";
import { ServerSync } from "../../data/ServerSync";
import { normalizeMindMapThumbnailSvg } from "../../data/thumbnailSvg";
import previewViewportConfig from "./native/previewViewportConfig.json";
import { applyMindMapMediaLimitsToConfig } from "./mindMapMediaLimits";
import {
  debugMindMapBridge,
  warnMindMapBridge,
} from "./mindMapBridgeDebug";
import {
  isNativeMindMapMessage,
  type NativeMindMapBridgePayload,
  type NativeMindMapMessage,
} from "./mindMapBridgeProtocol";
import {
  describeMindMapBridgeState,
  isAllowedNativeMindMapMessageOrigin,
  NATIVE_MINDMAP_URL,
} from "./mindMapBridgeOrigins";
import { useMindMapHostBridge } from "./useMindMapHostBridge";
import {
  getCachedMindMapDocument,
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

import "./MindMapEditorShell.scss";

function debugMindMapOpen(label: string, data?: Record<string, unknown>) {
  devDebug("mindmap-open", label, data);
}

function toBridgePayload(
  data: MindMapDocumentData,
  fileId: string | null,
): NativeMindMapBridgePayload {
  const mindMapData = applyMindMapBrowserView(data, fileId);
  const mindMapConfig = applyMindMapMediaLimitsToConfig({
    ...(mindMapData.config ?? {}),
  });
  if (!mindMapData.view) {
    mindMapConfig.__nbPreviewRootScreenRatioMultiplier =
      previewViewportConfig.editorRootScreenRatioMultiplier;
  }
  return {
    mindMapData,
    mindMapConfig,
    lang: mindMapData.lang ?? "zh",
    localConfig: mindMapData.localConfig ?? null,
  };
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

function decodeMindMapThumbnail(payload: unknown): string | null {
  if (typeof payload !== "string" || !payload) {
    return null;
  }
  if (!payload.startsWith("data:image/svg+xml")) {
    return payload;
  }
  const commaIndex = payload.indexOf(",");
  if (commaIndex === -1) {
    return null;
  }
  const meta = payload.slice(0, commaIndex);
  const body = payload.slice(commaIndex + 1);
  try {
    const decoded = meta.includes(";base64")
      ? new TextDecoder().decode(Uint8Array.from(atob(body), (c) => c.charCodeAt(0)))
      : decodeURIComponent(body);
    return normalizeMindMapThumbnailSvg(decoded);
  } catch {
    return null;
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
      thumbnail: decodeMindMapThumbnail(
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
      logEditorOpenPhase(phase, {
        editor: "mindmap",
        fileId8: fileId?.slice(0, 8) ?? null,
      });
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
  const shellStartRef = useRef(performance.now());
  const initStartRef = useRef<number | null>(null);

  const publishMindMapDataToNative = useCallback(
    (data: MindMapDocumentData, reason: string) => {
      publishDocument(toBridgePayload(data, fileId), reason);
    },
    [fileId, publishDocument],
  );

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
    persistLocalDraftToCache,
    saveCurrentFileToServer,
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
          if (isMindMapSingleRootOnly(document)) {
            clearMindMapBrowserView(fileId);
          }
          setFileName(
            LocalDraftSessions.get(fileId)?.name ?? DEFAULT_DOCUMENT_DISPLAY_NAME,
          );
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

          setFileName(serverFile.name || DEFAULT_DOCUMENT_DISPLAY_NAME);
          needsInitialThumbnailRef.current = !serverFile.has_thumbnail;
          const parseStart = performance.now();
          saveMindMapBrowserViewFromData(resolvedId, serverFile.data);
          const data = serverFile.data
            ? await MindMapAdapter.parse(serverFile.data)
            : MindMapAdapter.createEmpty();
          debugMindMapOpen("after MindMapAdapter.parse", {
            elapsed: Math.round(performance.now() - parseStart),
            rootChildren: data.root?.children?.length ?? 0,
            reason,
          });
          const document = MindMapAdapter.toDocument(data);
          if (isMindMapSingleRootOnly(document)) {
            clearMindMapBrowserView(resolvedId);
          }
          latestDocumentRef.current = document;
          FileSyncState.setLocalCache(
            resolvedId,
            toMindMapLocalCacheRecord(document),
          );
          if (serverFile.content_sha256) {
            FileSyncState.setServerHash(resolvedId, serverFile.content_sha256);
          }
          FileSyncState.alignHashes(resolvedId, hashDocumentSnapshot(document));
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
            getCachedFileListName(resolvedId) || DEFAULT_DOCUMENT_DISPLAY_NAME,
          );
          latestDocumentRef.current = cached;
          debugMindMapOpen("cache payload prepared", {
            fileId8: resolvedId.slice(0, 8),
            totalElapsed: Math.round(
              performance.now() - (initStartRef.current ?? performance.now()),
            ),
            hasUnsavedChanges,
            rootChildren: cached.data.root?.children?.length ?? 0,
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
            if (
              shouldFetchServerAfterCachedOpen({
                hasUnsavedChanges,
                localServerHash: FileSyncState.getServerHash(resolvedId),
                remoteServerHash: remoteHash,
              })
            ) {
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
      saveResolveRef.current = null;
      savePromiseRef.current = null;
    };
  }, [fileId, logMindMapOpenPhase, publishMindMapDataToNative]);

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
              source: "visibility",
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
            const document = updateLatestDocument(parsedData);
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
            } else {
              markDocumentChanged(document);
            }
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
        const thumbnail = decodeMindMapThumbnail(
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
        setStatus("有未保存更改");
        return;
      }
      const current = latestDocumentRef.current;
      if (!current) {
        return;
      }
      if (event.data.type === "saveMindMapConfig") {
        updateLatestDocument({
          ...current.data,
          config:
            event.data.payload &&
            typeof event.data.payload === "object" &&
            !Array.isArray(event.data.payload)
              ? (event.data.payload as Record<string, unknown>)
              : {},
        });
        markDocumentChanged(latestDocumentRef.current!);
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
        markDocumentChanged(latestDocumentRef.current!);
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
          markDocumentChanged(latestDocumentRef.current!);
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
    fileId,
    handleBridgeLifecycleMessage,
    handleNativeClipboardMessage,
    isAppReady,
    isBridgeReady,
    learnOrigin,
    learnedOrigin,
    markDocumentChanged,
    mindMapGoHomeWithServerSave,
    postToNative,
    requestNativeSave,
    saveCurrentFileToServer,
    updateLatestDocument,
  ]);

  const reloadMindMapFromServer = useCallback(async () => {
    if (!fileId) {
      return;
    }
    const serverFile = await ServerSync.getFile(fileId);
    saveMindMapBrowserViewFromData(fileId, serverFile.data);
    const data = serverFile.data
      ? await MindMapAdapter.parse(serverFile.data)
      : MindMapAdapter.createEmpty();
    const document = MindMapAdapter.toDocument(data);
    latestDocumentRef.current = document;
    publishMindMapDataToNative(data, "history-restore");
    FileSyncState.alignHashes(fileId, hashDocumentSnapshot(document));
    FileSyncState.clearLocalEditTime(fileId);
    FileSyncState.clearLocalCache(fileId);
    setFileName(serverFile.name || DEFAULT_DOCUMENT_DISPLAY_NAME);
    needsInitialThumbnailRef.current = !serverFile.has_thumbnail;
    setStatus("已恢复历史版本");
    setError(null);
    window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
    window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
  }, [fileId, publishMindMapDataToNative]);

  useEffect(() => {
    const onSave = () => requestSave({ source: "sidebar" });
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
    window.addEventListener("mindmap-host-request-save", onSave);
    window.addEventListener("excalidraw-host-request-save", onSave);
    window.addEventListener("mindmap-host-open-export", onExport);
    window.addEventListener("mindmap-host-open-import", onImport);
    window.addEventListener("mindmap-host-open-history", onHistory);
    window.addEventListener("excalidraw-host-open-history", onHistory);
    window.addEventListener("mindmap-host-open-embed", onEmbed);
    window.addEventListener("excalidraw-host-open-embed", onEmbed);
    window.addEventListener(APP_SHELL_GO_HOME, onShellGoHome);
    return () => {
      window.removeEventListener("mindmap-host-request-save", onSave);
      window.removeEventListener("excalidraw-host-request-save", onSave);
      window.removeEventListener("mindmap-host-open-export", onExport);
      window.removeEventListener("mindmap-host-open-import", onImport);
      window.removeEventListener("mindmap-host-open-history", onHistory);
      window.removeEventListener("excalidraw-host-open-history", onHistory);
      window.removeEventListener("mindmap-host-open-embed", onEmbed);
      window.removeEventListener("excalidraw-host-open-embed", onEmbed);
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
      const state = evaluateCurrentFileModificationState({
        fileId,
        kind: "mindmap",
        mindMapDocument: latestDocumentRef.current,
      });
      const hash =
        state.modified
          ? (state.contentHash ?? hashDocumentSnapshot(latestDocumentRef.current))
          : (state.baselineHash ??
            state.contentHash ??
            hashDocumentSnapshot(latestDocumentRef.current));
      FileSyncState.setDraftHash(fileId, hash);
      if (state.modified) {
        FileSyncState.setLocalCache(fileId, {
          document: latestDocumentRef.current,
          elements: undefined,
          appState: undefined,
          files: {},
          deltas: [],
        });
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
    let visibilitySaveTimer: number | null = null;
    const onVisibilityChange = () => {
      if (visibilitySaveTimer !== null) {
        window.clearTimeout(visibilitySaveTimer);
        visibilitySaveTimer = null;
      }
      if (!document.hidden || !getFileIdFromHash()) {
        return;
      }
      if (!isBridgeReady || !isAppReady) {
        return;
      }
      if (!getAppSettings().autoSaveOnBlur) {
        return;
      }
      visibilitySaveTimer = window.setTimeout(() => {
        visibilitySaveTimer = null;
        if (document.hidden) {
          requestSave({ source: "visibility" });
        }
      }, 600);
    };

    const unregisterAutoSave = registerAutoSaveTrigger(() => {
      requestSave({ source: "auto" });
    });

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      if (visibilitySaveTimer !== null) {
        window.clearTimeout(visibilitySaveTimer);
      }
      unregisterAutoSave();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isAppReady, isBridgeReady, saveToServerRef]);

  useEffect(() => {
    if (isAppReady) {
      logMindMapOpenPhase("ready");
    }
  }, [isAppReady, logMindMapOpenPhase]);

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
