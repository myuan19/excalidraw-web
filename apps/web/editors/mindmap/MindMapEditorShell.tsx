import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RemoteUpdateConfirmDialog } from "../../components/RemoteUpdateConfirmDialog";
import { getFileIdFromHash } from "../../data/fileIdFromHash";
import { FileSyncState } from "../../data/FileSyncState";
import {
  MindMapAdapter,
  type MindMapDocumentData,
} from "../../data/formats/MindMapAdapter";
import { hashDocumentSnapshot } from "../../data/sceneHash";
import { ServerSync, type ServerFile } from "../../data/ServerSync";
import { useRemoteFileRefresh } from "../../hooks/useRemoteFileRefresh";
import { useEditorDocumentTitle } from "../../lib/appBranding";
import { devDebug } from "../../lib/devDebug";

import { buildMindMapEmbedBridgePayload } from "./embed";
import {
  buildMindMapHostInitMessage,
  buildMindMapSaveRequestMessage,
  buildMindMapSaveStatusMessage,
  createMindMapBridgeRequestId,
  isMindMapNativeMessage,
  parseMindMapSavePayload,
} from "./mindMapBridge";
import {
  toMindMapLocalCacheRecord,
  useMindMapFileSave,
} from "./useMindMapFileSave";

const SAVE_DEBOUNCE_MS = 450;
const NATIVE_SAVE_TIMEOUT_MS = 8000;

export default function MindMapEditorShell() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [file, setFile] = useState<ServerFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const fileId = getFileIdFromHash();

  const bridgeReadyRef = useRef(false);
  const appInitedRef = useRef(false);
  const pendingInitRef = useRef<ReturnType<
    typeof buildMindMapEmbedBridgePayload
  > | null>(null);
  const baselineHashRef = useRef<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const saveInFlightRef = useRef(false);
  const pendingNativeSaveRef = useRef<Map<string, (ok: boolean) => void>>(
    new Map(),
  );

  useEditorDocumentTitle(file?.name);

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

  const reloadFromServer = useCallback(async () => {
    if (!fileId) {
      return;
    }
    const next = await ServerSync.getFile(fileId, { force: true });
    setFile(next);
    setError(null);
    const document = MindMapAdapter.toDocument(MindMapAdapter.parse(next.data));
    baselineHashRef.current = hashDocumentSnapshot(document);
    FileSyncState.alignHashes(fileId, baselineHashRef.current);
    pendingInitRef.current = buildMindMapEmbedBridgePayload(next.data);
    iframeRef.current?.contentWindow?.postMessage(
      buildMindMapHostInitMessage(next.data),
      window.location.origin,
    );
  }, [fileId]);

  const remoteRefresh = useRemoteFileRefresh({
    fileId,
    reload: reloadFromServer,
    onReloaded: () => {
      setStatusMessage("已加载最新版本");
    },
  });

  useEffect(() => {
    let cancelled = false;
    if (!fileId) {
      setFile(null);
      return;
    }
    ServerSync.getFile(fileId, { force: true })
      .then((next) => {
        if (!cancelled) {
          setFile(next);
          setError(null);
          const document = MindMapAdapter.toDocument(
            MindMapAdapter.parse(next.data),
          );
          const hash = hashDocumentSnapshot(document);
          baselineHashRef.current = hash;
          FileSyncState.setServerHash(next.id, next.content_sha256);
          FileSyncState.alignHashes(next.id, hash);
          FileSyncState.setLocalCache(
            next.id,
            toMindMapLocalCacheRecord(document),
          );
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  const initPayload = useMemo(() => {
    if (!file) {
      return null;
    }
    try {
      return buildMindMapEmbedBridgePayload(file.data);
    } catch {
      return buildMindMapEmbedBridgePayload(
        MindMapAdapter.toDocument(MindMapAdapter.createEmpty(file.name)).data,
      );
    }
  }, [file]);

  useEffect(() => {
    pendingInitRef.current = initPayload;
  }, [initPayload]);

  const postInit = useCallback(() => {
    if (!initPayload) {
      return;
    }
    devDebug("mindmap-bridge", "postInit", { fileId8: fileId?.slice(0, 8) });
    iframeRef.current?.contentWindow?.postMessage(
      buildMindMapHostInitMessage(initPayload.data, initPayload.view),
      window.location.origin,
    );
  }, [fileId, initPayload]);

  const postToNative = useCallback((message: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(
      message,
      window.location.origin,
    );
  }, []);

  const persistMindMapDocument = useCallback(
    async (
      mindMapData: MindMapDocumentData,
      source: "manual" | "auto" | "visibility",
      thumbnail?: string | null,
      requestId?: string | null,
    ) => {
      if (!fileId || saveInFlightRef.current) {
        return false;
      }
      saveInFlightRef.current = true;
      try {
        const document = MindMapAdapter.toDocument(mindMapData);
        const hash = hashDocumentSnapshot(document);
        FileSyncState.setDraftHash(fileId, hash);
        FileSyncState.setLocalCache(fileId, toMindMapLocalCacheRecord(document));
        const result = await saveMindMapFile(
          document,
          source,
          file?.name,
          thumbnail,
        );
        if (result?.content_sha256) {
          baselineHashRef.current = hash;
          FileSyncState.alignHashes(fileId, hash);
        }
        if (requestId) {
          postToNative(buildMindMapSaveStatusMessage(requestId, true));
        }
        window.dispatchEvent(new CustomEvent("cross-tab-file-saved"));
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatusMessage(message);
        if (requestId) {
          postToNative(buildMindMapSaveStatusMessage(requestId, false, message));
        }
        return false;
      } finally {
        saveInFlightRef.current = false;
      }
    },
    [file?.name, fileId, postToNative, saveMindMapFile],
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
      const delay = requestId ? 0 : SAVE_DEBOUNCE_MS;
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        void persistMindMapDocument(
          mindMapData,
          requestId ? "manual" : "auto",
          thumbnail,
          requestId,
        ).then((ok) => {
          if (requestId) {
            pendingNativeSaveRef.current.get(requestId)?.(ok);
          }
        });
      }, delay);
    },
    [persistMindMapDocument],
  );

  const requestNativeSave = useCallback(
    (source: "manual" | "visibility" = "manual") => {
      if (!bridgeReadyRef.current || !appInitedRef.current) {
        devDebug("mindmap-bridge", "requestNativeSave skipped: not ready", {
          source,
        });
        return Promise.resolve(false);
      }
      const requestId = createMindMapBridgeRequestId();
      devDebug("mindmap-bridge", "requestNativeSave | start", {
        requestId,
        source,
      });
      return new Promise<boolean>((resolve) => {
        const timer = window.setTimeout(() => {
          pendingNativeSaveRef.current.delete(requestId);
          devDebug("mindmap-bridge", "requestNativeSave | timeout", {
            requestId,
            timeoutMs: NATIVE_SAVE_TIMEOUT_MS,
          });
          resolve(false);
        }, NATIVE_SAVE_TIMEOUT_MS);
        pendingNativeSaveRef.current.set(requestId, (ok) => {
          window.clearTimeout(timer);
          pendingNativeSaveRef.current.delete(requestId);
          resolve(ok);
        });
        postToNative(buildMindMapSaveRequestMessage(requestId));
      });
    },
    [postToNative],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      if (!isMindMapNativeMessage(event.data)) {
        return;
      }
      const message = event.data;
      const type = message.type;

      if (type === "ready") {
        bridgeReadyRef.current = true;
        postInit();
        return;
      }

      if (type === "appInited") {
        appInitedRef.current = true;
        postInit();
        return;
      }

      if (type === "saveMindMapData") {
        const parsed = parseMindMapSavePayload(message.payload);
        if (!parsed) {
          return;
        }
        devDebug("mindmap-bridge", "saveMindMapData", {
          revision: parsed.revision ?? null,
          requestId: parsed.requestId ?? null,
        });
        queueAutoSave(
          parsed.mindMapData,
          parsed.thumbnail,
          parsed.requestId ?? null,
        );
        return;
      }

      if (type === "mindMapIframeError") {
        const payload = message.payload as { message?: string } | undefined;
        setStatusMessage(payload?.message || "MindMap iframe error");
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [postInit, queueAutoSave]);

  useEffect(() => {
    const onHostSave = () => {
      void requestNativeSave("manual");
    };
    const onVisibilitySave = () => {
      void requestNativeSave("visibility");
    };
    window.addEventListener("mindmap-host-request-save", onHostSave);
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        onVisibilitySave();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("mindmap-host-request-save", onHostSave);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [requestNativeSave]);

  useEffect(() => {
    bridgeReadyRef.current = false;
    appInitedRef.current = false;
  }, [fileId]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
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
    <>
      <RemoteUpdateConfirmDialog
        open={remoteRefresh.promptOpen}
        onConfirm={remoteRefresh.confirmReload}
        onDismiss={remoteRefresh.dismissPrompt}
      />
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
      <iframe
        ref={iframeRef}
        title={file.name || "MindMap"}
        src="/mind-map/index.html"
        style={{ width: "100%", height: "100%", border: 0 }}
        onLoad={() => {
          if (initPayload) {
            iframeRef.current?.contentWindow?.postMessage(
              buildMindMapHostInitMessage(initPayload.data, initPayload.view),
              window.location.origin,
            );
          }
        }}
      />
    </>
  );
}
