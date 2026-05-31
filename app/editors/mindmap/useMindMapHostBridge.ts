import { useCallback, useEffect, useRef, useState } from "react";

import {
  MindMapHostBridge,
  type MindMapHostBridgeSnapshot,
} from "./mindMapHostBridge";
import type { NativeMindMapBridgePayload } from "./mindMapBridgeProtocol";

type UseMindMapHostBridgeOptions = {
  fileId: string | null;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  debugOpen?: (label: string, data?: Record<string, unknown>) => void;
};

export function useMindMapHostBridge({
  fileId,
  iframeRef,
  debugOpen,
}: UseMindMapHostBridgeOptions) {
  const bridgeRef = useRef<MindMapHostBridge | null>(null);
  const [snapshot, setSnapshot] = useState<MindMapHostBridgeSnapshot>({
    phase: "idle",
    bootKey: 0,
    learnedOrigin: null,
    isBridgeReady: false,
    isAppReady: false,
    failure: null,
  });
  const [bridgeStatus, setBridgeStatus] = useState("加载中…");
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [isNativeReady, setIsNativeReady] = useState(false);

  useEffect(() => {
    const bridge = new MindMapHostBridge({
      getIframe: () => iframeRef.current,
      debugOpen,
      callbacks: {
        onSnapshot: setSnapshot,
        onStatus: setBridgeStatus,
        onError: setBridgeError,
        onNativeReady: setIsNativeReady,
        onBootKeyChange: (bootKey) => {
          setSnapshot((prev) => ({ ...prev, bootKey }));
        },
      },
    });
    bridgeRef.current = bridge;
    return () => {
      bridge.dispose();
      bridgeRef.current = null;
    };
  }, [debugOpen, iframeRef]);

  useEffect(() => {
    bridgeRef.current?.beginSession();
  }, [fileId, snapshot.bootKey]);

  const publishDocument = useCallback(
    (payload: NativeMindMapBridgePayload, reason: string) => {
      bridgeRef.current?.publishDocument(payload, reason);
    },
    [],
  );

  const postToNative = useCallback((type: string, payload?: unknown) => {
    return bridgeRef.current?.postToNative(type, payload) ?? false;
  }, []);

  const onIframeLoad = useCallback(() => {
    bridgeRef.current?.onIframeLoad();
  }, []);

  const onIframeError = useCallback(() => {
    bridgeRef.current?.onIframeError();
  }, []);

  const handleBridgeLifecycleMessage = useCallback(
    (
      message: Parameters<MindMapHostBridge["handleNativeMessage"]>[0],
      origin: string,
    ) => {
      return bridgeRef.current?.handleNativeMessage(message, origin) === "consumed";
    },
    [],
  );

  const learnOrigin = useCallback((origin: string) => {
    bridgeRef.current?.learnOrigin(origin);
  }, []);

  return {
    bootKey: snapshot.bootKey,
    bridgePhase: snapshot.phase,
    bridgeSnapshot: snapshot,
    bridgeStatus,
    bridgeError,
    isNativeReady,
    isAppReady: snapshot.isAppReady,
    isBridgeReady: snapshot.isBridgeReady,
    learnedOrigin: snapshot.learnedOrigin,
    publishDocument,
    postToNative,
    onIframeLoad,
    onIframeError,
    handleBridgeLifecycleMessage,
    learnOrigin,
  };
}
