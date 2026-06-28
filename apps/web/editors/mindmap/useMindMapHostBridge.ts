import { useCallback, useEffect, useRef, useState } from "react";

import {
  useEditorPaneLifecycle,
} from "../../shell/editorPaneLifecycle";
import {
  editorOpenPhaseFromBridgeStatus,
  logEditorOpenPhase,
} from "../../lib/editorOpenPhases";
import {
  MindMapHostBridge,
  type MindMapHostBridgeSnapshot,
} from "./mindMapHostBridge";
import type { NativeMindMapBridgePayload } from "./mindMapBridgeProtocol";

type UseMindMapHostBridgeOptions = {
  fileId: string | null;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  /** When false, defer iframe session boot (background pane). */
  sessionEnabled?: boolean;
  isPaneForeground?: boolean;
  onPaneForeground?: () => void;
  onPaneBackground?: () => void;
  debugOpen?: (label: string, data?: Record<string, unknown>) => void;
};

export function useMindMapHostBridge({
  fileId,
  iframeRef,
  sessionEnabled = true,
  isPaneForeground = true,
  onPaneForeground,
  onPaneBackground,
  debugOpen,
}: UseMindMapHostBridgeOptions) {
  const bridgeRef = useRef<MindMapHostBridge | null>(null);
  const onPaneForegroundRef = useRef(onPaneForeground);
  onPaneForegroundRef.current = onPaneForeground;
  const onPaneBackgroundRef = useRef(onPaneBackground);
  onPaneBackgroundRef.current = onPaneBackground;
  const [snapshot, setSnapshot] = useState<MindMapHostBridgeSnapshot>({
    phase: "idle",
    bootKey: 0,
    learnedOrigin: null,
    isBridgeReady: false,
    isAppReady: false,
    failure: null,
  });
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [isNativeReady, setIsNativeReady] = useState(false);

  const handlePaneForeground = useCallback(() => {
    bridgeRef.current?.onForeground();
    onPaneForegroundRef.current?.();
  }, []);

  useEffect(() => {
    const bridge = new MindMapHostBridge({
      getIframe: () => iframeRef.current,
      debugOpen,
      callbacks: {
        onSnapshot: setSnapshot,
        onStatus: (status) => {
          logEditorOpenPhase(editorOpenPhaseFromBridgeStatus(status), {
            editor: "mindmap",
            source: "bridge",
            bridgeStatus: status,
          });
        },
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
    if (!sessionEnabled) {
      return;
    }
    bridgeRef.current?.beginSession();
  }, [fileId, snapshot.bootKey, sessionEnabled]);

  useEditorPaneLifecycle({
    isForeground: isPaneForeground,
    onForeground: handlePaneForeground,
    onBackground: () => onPaneBackgroundRef.current?.(),
  });

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

  const isMessageFromCurrentIframe = useCallback(
    (source: MessageEventSource | null) => {
      return bridgeRef.current?.isMessageFromCurrentIframe(source) === true;
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
    bridgeError,
    isNativeReady,
    isAppReady: snapshot.isAppReady,
    isBridgeReady: snapshot.isBridgeReady,
    learnedOrigin: snapshot.learnedOrigin,
    isMessageFromCurrentIframe,
    publishDocument,
    postToNative,
    onIframeLoad,
    onIframeError,
    handleBridgeLifecycleMessage,
    learnOrigin,
  };
}
