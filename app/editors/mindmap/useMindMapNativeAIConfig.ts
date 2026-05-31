import { useCallback, useEffect, useRef } from "react";

import {
  ensureAIConfigLoaded,
  getCachedAIConfig,
  isMindMapAIConfigured,
  resolveMindMapAIEndpoint,
  subscribeAIConfig,
} from "../../data/aiConfig";
import { devDebug } from "../../lib/devDebug";

type PostToNative = (type: string, payload: unknown) => void;

function mindMapAiConfigSignature(): string {
  const config = getCachedAIConfig().mindmap;
  const configured = isMindMapAIConfigured();
  const resolvedEndpoint = resolveMindMapAIEndpoint(config.endpoint);
  const model = config.model || "gpt-4o";
  return [
    configured ? "1" : "0",
    resolvedEndpoint,
    config.apiKey?.length ?? 0,
    model,
  ].join("|");
}

/**
 * Single coordinator: load AI settings once, subscribe to updates, push to the
 * native iframe only when the bridge is ready and the effective config changed.
 */
export function useMindMapNativeAIConfig(opts: {
  isBridgeReady: boolean;
  postToNative: PostToNative;
}): void {
  const { isBridgeReady, postToNative } = opts;
  const lastSignatureRef = useRef<string | null>(null);

  const pushConfigIfChanged = useCallback(
    (reason: string) => {
      if (!isBridgeReady) {
        return;
      }
      const config = getCachedAIConfig().mindmap;
      const configured = isMindMapAIConfigured();
      const resolvedEndpoint = resolveMindMapAIEndpoint(config.endpoint);
      const model = config.model || "gpt-4o";
      const signature = mindMapAiConfigSignature();
      if (lastSignatureRef.current === signature) {
        devDebug("mindmap-open", "mindMapAiConfig unchanged", { reason });
        return;
      }
      lastSignatureRef.current = signature;
      devDebug("mindmap-open", "mindMapAiConfig push", {
        reason,
        configured,
        model,
      });
      postToNative("mindMapAiConfig", {
        configured,
        api: resolvedEndpoint,
        key: config.apiKey,
        model,
        method: "POST",
      });
    },
    [isBridgeReady, postToNative],
  );

  useEffect(() => {
    let disposed = false;
    void ensureAIConfigLoaded()
      .then(() => {
        if (!disposed) {
          pushConfigIfChanged("ensureAIConfigLoaded");
        }
      })
      .catch((error) => {
        devDebug("mindmap-open", "ensureAIConfigLoaded failed", {
          message: error instanceof Error ? error.message : String(error),
        });
        if (!disposed) {
          pushConfigIfChanged("ensureAIConfigLoaded.catch");
        }
      });
    const unsubscribe = subscribeAIConfig(() => {
      pushConfigIfChanged("subscribeAIConfig");
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [pushConfigIfChanged]);

  useEffect(() => {
    if (isBridgeReady) {
      pushConfigIfChanged("bridge-ready");
    }
  }, [isBridgeReady, pushConfigIfChanged]);
}
