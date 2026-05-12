import { useCallback, useEffect, useRef, useState } from "react";

import { AISettings } from "./components/AISettings";
import { ArchivePanel } from "./components/ArchivePanel";
import {
  ensureAIConfigLoaded,
  getCachedAIConfig,
  isMindMapAIConfigured,
  resolveMindMapAIEndpoint,
  subscribeAIConfig,
} from "./data/aiConfig";
import { FileSyncState } from "./data/FileSyncState";
import { readFileListTreeCache } from "./data/fileListSessionCache";
import { getFileIdFromHash } from "./data/fileIdFromHash";
import { LocalThumbnailCache } from "./data/localThumbnailCache";
import { isEffectivelyEmptyMindMapData } from "./data/formats/MindMapAdapter";
import { MindMapAdapter } from "./data/formats/registry";
import {
  shouldFetchServerAfterCachedMindMapOpen,
  shouldOpenCachedMindMapFirst,
} from "./data/mindMapOpenState";
import { hashDocumentSnapshot } from "./data/sceneHash";
import { ServerSync } from "./data/ServerSync";
import { normalizeMindMapThumbnailSvg } from "./data/thumbnailSvg";
import {
  getCachedMindMapDocument,
  MINDMAP_SAVE_TIMEOUT_MS,
  toMindMapLocalCacheRecord,
  type MindMapNativeSaveResult,
  useMindMapFileSave,
} from "./hooks/useMindMapFileSave";

import type { ManagedDocument } from "./data/documentTypes";
import type { MindMapDocumentData } from "./data/formats/MindMapAdapter";

import "./MindMapEditorShell.scss";

const NATIVE_MINDMAP_URL = "/mind-map/index.html";
const HOST_SOURCE = "excalidraw-web";
const NATIVE_SOURCE = "simple-mind-map-native";

function debugMindMapOpen(label: string, data?: Record<string, unknown>) {
  console.log(`[DEBUG] mindmap-open | ${label}`, {
    t: Math.round(performance.now()),
    ...(data ?? {}),
  });
}

type NativeMindMapBridgePayload = {
  mindMapData: MindMapDocumentData;
  mindMapConfig: Record<string, unknown>;
  lang: string;
  localConfig: Record<string, unknown> | null;
};

type NativeMindMapMessage =
  | {
      source: typeof NATIVE_SOURCE;
      type: "ready" | "appInited";
      payload?: unknown;
    }
  | {
      source: typeof NATIVE_SOURCE;
      type: "saveMindMapData";
      payload: unknown;
    }
  | {
      source: typeof NATIVE_SOURCE;
      type:
        | "saveMindMapConfig"
        | "saveLocalConfig"
        | "saveLanguage"
        | "mindMapDirtyState"
        | "mindMapScaleState";
      payload: unknown;
    }
  | {
      source: typeof NATIVE_SOURCE;
      type:
        | "hostBackToFiles"
        | "hostRequestSave"
        | "hostOpenAISettings"
        | "hostOpenHistory"
        | "CLIPBOARD_WRITE_TEXT"
        | "CLIPBOARD_READ_TEXT"
        | "CLIPBOARD_READ"
        | "CLIPBOARD_WRITE_IMAGE";
      payload?: unknown;
    };

function isNativeMindMapMessage(value: unknown): value is NativeMindMapMessage {
  return (
    value !== null &&
    typeof value === "object" &&
    (value as { source?: unknown }).source === NATIVE_SOURCE &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

function toBridgePayload(data: MindMapDocumentData): NativeMindMapBridgePayload {
  return {
    mindMapData: data,
    mindMapConfig: data.config ?? {},
    lang: data.lang ?? "zh",
    localConfig: data.localConfig ?? null,
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
  const pendingInitPayloadRef = useRef<NativeMindMapBridgePayload | null>(null);
  const [status, setStatus] = useState("加载中…");
  const [isNativeReady, setIsNativeReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("未命名 mindmap");
  const [showAISettings, setShowAISettings] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [, setNativeScale] = useState<number | null>(null);
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
  const nativeAppInitedRef = useRef(false);
  const shellStartRef = useRef(performance.now());
  const initStartRef = useRef<number | null>(null);

  useEffect(() => {
    document.title = "mindmap";
  }, []);

  useEffect(() => {
    debugMindMapOpen("MindMapEditorShell mounted", {
      fileId8: fileId?.slice(0, 8) ?? null,
      sinceShellStart: Math.round(performance.now() - shellStartRef.current),
    });
  }, [fileId]);

  const postToNative = useCallback((type: string, payload?: unknown) => {
    if (type === "initMindMap" || type === "requestMindMapSave") {
      debugMindMapOpen(`postToNative ${type}`, {
        hasPayload: payload != null,
        fileId8: getFileIdFromHash()?.slice(0, 8) ?? null,
      });
    }
    iframeRef.current?.contentWindow?.postMessage(
      {
        source: HOST_SOURCE,
        type,
        payload,
      },
      window.location.origin,
    );
  }, []);

  const sendInitPayload = useCallback(() => {
    if (!pendingInitPayloadRef.current) {
      debugMindMapOpen("sendInitPayload skipped: no pending payload");
      return;
    }
    debugMindMapOpen("sendInitPayload", {
      rootChildren:
        pendingInitPayloadRef.current.mindMapData.root?.children?.length ?? 0,
      hasView: !!pendingInitPayloadRef.current.mindMapData.view,
    });
    postToNative("initMindMap", pendingInitPayloadRef.current);
  }, [postToNative]);

  const publishMindMapDataToNative = useCallback(
    (data: MindMapDocumentData) => {
      pendingInitPayloadRef.current = toBridgePayload(data);
      if (nativeAppInitedRef.current) {
        debugMindMapOpen("publish setMindMapData to initialized iframe", {
          rootChildren: data.root?.children?.length ?? 0,
          hasView: !!data.view,
        });
        postToNative("setMindMapData", pendingInitPayloadRef.current);
        setIsNativeReady(true);
        return;
      }
      sendInitPayload();
    },
    [postToNative, sendInitPayload],
  );

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
          console.log("[DEBUG] MindMapEditorShell | CLIPBOARD_READ start", {
            requestId,
            hasClipboardRead: !!navigator.clipboard?.read,
            hasClipboardReadText: !!navigator.clipboard?.readText,
            documentHasFocus: document.hasFocus(),
          });
          const items = await readClipboardItemsForNative();
          console.log("[DEBUG] MindMapEditorShell | CLIPBOARD_READ done", {
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
        console.log("[DEBUG] MindMapEditorShell | clipboard bridge failed", {
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
      return savePromiseRef.current;
    }
    const promise = new Promise<MindMapNativeSaveResult | null>((resolve) => {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      saveResolveRef.current = resolve;
      saveRequestIdRef.current = requestId;
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = window.setTimeout(() => {
        saveResolveRef.current = null;
        savePromiseRef.current = null;
        saveTimeoutRef.current = null;
        setError("mindmap 原生界面未响应保存请求");
        resolve(null);
      }, MINDMAP_SAVE_TIMEOUT_MS);
      postToNative("requestMindMapSave", { requestId });
    });
    savePromiseRef.current = promise;
    return promise;
  }, [postToNative]);

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
  } = useMindMapFileSave({
    getCurrentDocument: () => latestDocumentRef.current,
    requestNativeMindMapData: requestNativeSave,
    getFileName: () => fileName,
    navigateToFileListHome: () => {
      window.location.hash = "";
    },
    setErrorMessage: setError,
    setStatus,
  });

  const postMindMapAIConfig = useCallback(
    (reason: string) => {
      const config = getCachedAIConfig().mindmap;
      const configured = isMindMapAIConfigured();
      const resolvedEndpoint = resolveMindMapAIEndpoint(config.endpoint);
      console.log("[DEBUG] MindMapEditorShell | post mindMapAiConfig", {
        reason,
        configured,
        hasEndpoint: !!config.endpoint?.trim(),
        endpoint: config.endpoint?.trim() || "",
        resolvedEndpoint,
        hasKey: !!config.apiKey?.trim(),
        keyLen: config.apiKey?.length ?? 0,
        model: config.model || "gpt-4o",
        hasIframeWindow: !!iframeRef.current?.contentWindow,
        nativeAppInited: nativeAppInitedRef.current,
      });
      postToNative("mindMapAiConfig", {
        configured,
        api: resolvedEndpoint,
        key: config.apiKey,
        model: config.model || "gpt-4o",
        method: "POST",
      });
    },
    [postToNative],
  );

  useEffect(() => {
    const syncAiStatus = () => postMindMapAIConfig("subscribeAIConfig");
    ensureAIConfigLoaded()
      .then(() => postMindMapAIConfig("ensureAIConfigLoaded"))
      .catch((error) => {
        console.log("[DEBUG] MindMapEditorShell | ensureAIConfigLoaded failed", {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        postMindMapAIConfig("ensureAIConfigLoaded.catch");
      });
    return subscribeAIConfig(syncAiStatus);
  }, [postMindMapAIConfig]);

  useEffect(() => {
    postToNative("mindMapHostSaveStatus", {
      saving: mindMapSaving,
      hint: mindMapSaveHint,
    });
  }, [mindMapSaveHint, mindMapSaving, postToNative]);

  useEffect(() => {
    let disposed = false;

    async function init() {
      setIsNativeReady(false);
      setStatus("加载中…");
      if (!fileId) {
        setError("缺少 mindmap 文件");
        return;
      }

      try {
        initStartRef.current = performance.now();
        debugMindMapOpen("init start", {
          fileId8: fileId.slice(0, 8),
        });
        const cached = getCachedMindMapDocument(fileId);
        const hasUnsavedChanges = FileSyncState.hasUnsavedChanges(fileId);

        const loadFromServer = async (reason: string) => {
          const serverStart = performance.now();
          debugMindMapOpen("before ServerSync.getFile", {
            fileId8: fileId.slice(0, 8),
            reason,
          });
          const serverFile = await ServerSync.getFile(fileId);
          debugMindMapOpen("after ServerSync.getFile", {
            fileId8: fileId.slice(0, 8),
            reason,
            elapsed: Math.round(performance.now() - serverStart),
            hasData: !!serverFile.data,
            hasThumbnail: !!serverFile.has_thumbnail,
            kind: serverFile.kind,
          });
          if (disposed) {
            return;
          }

          setFileName(serverFile.name || "未命名 mindmap");
          needsInitialThumbnailRef.current = !serverFile.has_thumbnail;
          const parseStart = performance.now();
          const data = serverFile.data
            ? await MindMapAdapter.parse(serverFile.data)
            : MindMapAdapter.createEmpty();
          debugMindMapOpen("after MindMapAdapter.parse", {
            elapsed: Math.round(performance.now() - parseStart),
            rootChildren: data.root?.children?.length ?? 0,
            reason,
          });
          const document = MindMapAdapter.toDocument(data);
          latestDocumentRef.current = document;
          FileSyncState.setLocalCache(
            fileId,
            toMindMapLocalCacheRecord(document),
          );
          if (serverFile.content_sha256) {
            FileSyncState.setServerHash(fileId, serverFile.content_sha256);
          }
          FileSyncState.alignHashes(fileId, hashDocumentSnapshot(document));
          debugMindMapOpen("server payload prepared", {
            fileId8: fileId.slice(0, 8),
            totalElapsed: Math.round(
              performance.now() - (initStartRef.current ?? performance.now()),
            ),
            reason,
          });
          setStatus("等待 mindmap 原生界面加载…");
          publishMindMapDataToNative(data);
        };

        if (
          shouldOpenCachedMindMapFirst({ hasCachedDocument: !!cached }) &&
          cached
        ) {
          setFileName(getCachedFileListName(fileId) || "未命名 mindmap");
          latestDocumentRef.current = cached;
          debugMindMapOpen("cache payload prepared", {
            fileId8: fileId.slice(0, 8),
            totalElapsed: Math.round(
              performance.now() - (initStartRef.current ?? performance.now()),
            ),
            hasUnsavedChanges,
            rootChildren: cached.data.root?.children?.length ?? 0,
          });
          setStatus(
            hasUnsavedChanges ? "已恢复本地草稿" : "正在校验服务器版本…",
          );
          publishMindMapDataToNative(cached.data);

          try {
            const hashStart = performance.now();
            const hashes = await ServerSync.listFileHashes();
            const remoteHash =
              hashes.find((entry) => entry.id === fileId)?.content_sha256 ??
              null;
            debugMindMapOpen("after ServerSync.listFileHashes", {
              fileId8: fileId.slice(0, 8),
              elapsed: Math.round(performance.now() - hashStart),
              remoteHash8: remoteHash?.slice(0, 8) ?? null,
              localServerHash8:
                FileSyncState.getServerHash(fileId)?.slice(0, 8) ?? null,
              hasUnsavedChanges,
            });
            if (disposed) {
              return;
            }
            if (
              shouldFetchServerAfterCachedMindMapOpen({
                hasUnsavedChanges,
                localServerHash: FileSyncState.getServerHash(fileId),
                remoteServerHash: remoteHash,
              })
            ) {
              await loadFromServer("remote-hash-changed-after-cache");
              return;
            }
            if (remoteHash) {
              FileSyncState.setServerHash(fileId, remoteHash);
            }
            if (!hasUnsavedChanges) {
              setStatus("等待 mindmap 原生界面加载…");
            }
            return;
          } catch (err: any) {
            debugMindMapOpen("listFileHashes after cache failed", {
              message: err?.message || String(err),
            });
            if (!hasUnsavedChanges) {
              setStatus("等待 mindmap 原生界面加载…");
            }
            return;
          }
        }

        await loadFromServer("no-cache");
      } catch (err: any) {
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
  }, [fileId, publishMindMapDataToNative]);

  useEffect(() => {
    if (!fileId) {
      return;
    }
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      if (!isNativeMindMapMessage(event.data)) {
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
      if (event.data.type === "ready") {
        debugMindMapOpen("received iframe ready", {
          sinceShellStart: Math.round(performance.now() - shellStartRef.current),
        });
        sendInitPayload();
        return;
      }
      if (event.data.type === "appInited") {
        nativeAppInitedRef.current = true;
        setIsNativeReady(true);
        debugMindMapOpen("received appInited", {
          sinceShellStart: Math.round(performance.now() - shellStartRef.current),
          sinceInitStart: initStartRef.current
            ? Math.round(performance.now() - initStartRef.current)
            : null,
          needsInitialThumbnail: needsInitialThumbnailRef.current,
        });
        setStatus("已打开 mindmap 原生界面");
        ensureAIConfigLoaded()
          .then(() => postMindMapAIConfig("appInited"))
          .catch((error) => {
            console.log(
              "[DEBUG] MindMapEditorShell | appInited AI config load failed",
              {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
              },
            );
          });
        if (needsInitialThumbnailRef.current) {
          needsInitialThumbnailRef.current = false;
          debugMindMapOpen("trigger initial thumbnail save");
          void saveCurrentFileToServer({
            source: "visibility",
            forceThumbnail: true,
          });
        }
        return;
      }
      if (event.data.type === "hostBackToFiles") {
        void mindMapGoHomeWithServerSave();
        return;
      }
      if (event.data.type === "hostOpenAISettings") {
        setShowAISettings(true);
        return;
      }
      if (event.data.type === "hostOpenHistory") {
        setShowHistoryPanel((value) => !value);
        return;
      }
      if (event.data.type === "hostRequestSave") {
        void saveCurrentFileToServer({ source: "toolbar" });
        return;
      }
      if (event.data.type === "saveMindMapData") {
        const savePayload = getMindMapSavePayload(event.data.payload);
        const isCurrentSaveResponse =
          !!saveResolveRef.current &&
          !!savePayload.requestId &&
          savePayload.requestId === saveRequestIdRef.current;
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
          console.log(
            "[DEBUG] MindMapEditorShell | skip transient empty saveMindMapData",
            {
              requestId: savePayload.requestId ?? null,
              revision: savePayload.revision ?? null,
              previousRootChildren:
                previousDocument.data.root.children?.length ?? 0,
            },
          );
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
            console.log("[DEBUG] MindMapEditorShell | saveMindMapData parse failed", {
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
      if (event.data.type === "mindMapScaleState") {
        const scale =
          event.data.payload &&
          typeof event.data.payload === "object" &&
          typeof (event.data.payload as { scale?: unknown }).scale === "number"
            ? (event.data.payload as { scale: number }).scale
            : null;
        setNativeScale(scale);
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
    handleNativeClipboardMessage,
    markDocumentChanged,
    mindMapGoHomeWithServerSave,
    requestNativeSave,
    saveCurrentFileToServer,
    sendInitPayload,
    postMindMapAIConfig,
    updateLatestDocument,
  ]);

  const reloadMindMapFromServer = useCallback(async () => {
    if (!fileId) {
      return;
    }
    const serverFile = await ServerSync.getFile(fileId);
    const data = serverFile.data
      ? await MindMapAdapter.parse(serverFile.data)
      : MindMapAdapter.createEmpty();
    const document = MindMapAdapter.toDocument(data);
    latestDocumentRef.current = document;
    pendingInitPayloadRef.current = toBridgePayload(data);
    FileSyncState.alignHashes(fileId, hashDocumentSnapshot(document));
    FileSyncState.clearLocalEditTime(fileId);
    FileSyncState.clearLocalCache(fileId);
    setFileName(serverFile.name || "未命名 mindmap");
    needsInitialThumbnailRef.current = !serverFile.has_thumbnail;
    setStatus("已恢复历史版本");
    setError(null);
    sendInitPayload();
    window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
    window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
  }, [fileId, sendInitPayload]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key !== "s") {
        return;
      }
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (event as KeyboardEvent & { isComposing?: boolean }).isComposing
      ) {
        return;
      }
      if (!getFileIdFromHash()) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      void saveToServerRef.current({ source: "hotkey" });
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [saveToServerRef]);

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
      const hash = hashDocumentSnapshot(latestDocumentRef.current);
      FileSyncState.setDraftHash(fileId, hash);
      if (FileSyncState.hasUnsavedChanges(fileId)) {
        FileSyncState.setLocalCache(fileId, {
          document: latestDocumentRef.current,
          elements: undefined,
          appState: undefined,
          files: {},
          deltas: [],
        });
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
      visibilitySaveTimer = window.setTimeout(() => {
        visibilitySaveTimer = null;
        if (document.hidden) {
          void saveToServerRef.current({ source: "visibility" });
        }
      }, 600);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      if (visibilitySaveTimer !== null) {
        window.clearTimeout(visibilitySaveTimer);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [saveToServerRef]);

  return (
    <main className="mindmap-editor">
      {error ? (
        <section className="mindmap-editor__error">
          <strong>mindmap 打开失败</strong>
          <span>{error}</span>
        </section>
      ) : null}
      {!error && !isNativeReady ? (
        <div className="mindmap-editor__loading">
          <div className="editor-loading-spinner" />
          <span>{status}</span>
        </div>
      ) : null}
      <iframe
        ref={iframeRef}
        title="mindmap"
        className="mindmap-editor__native-frame"
        src={NATIVE_MINDMAP_URL}
        allow="clipboard-read; clipboard-write"
      />
      <AISettings
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
              当前 mindmap 有未保存的修改，是否先保存？
            </p>
            <div className="fork-home-dialog-actions">
              <button
                type="button"
                className="fork-home-btn fork-home-btn--primary"
                disabled={mindMapSaving}
                onClick={() => void mindMapHomeConfirmSave()}
              >
                保存并返回
              </button>
              <button
                type="button"
                className="fork-home-btn fork-home-btn--danger"
                disabled={mindMapSaving}
                onClick={() => void mindMapHomeConfirmDiscard()}
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
    </main>
  );
};

export default MindMapEditorShell;
