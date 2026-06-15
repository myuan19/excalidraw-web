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

const MINDMAP_AI_PROXY_ENDPOINT = "/api/mindmap/ai/chat";
const MINDMAP_AI_PROXY_TRANSPORT = "host-proxy";

function summarizeMindMapAIConfig(reason: string) {
  const config = getCachedAIConfig().mindmap;
  const configured = isMindMapAIConfigured();
  const resolvedEndpoint = resolveMindMapAIEndpoint(config.endpoint);
  const model = config.model || "gpt-4o";
  return {
    reason,
    configured,
    rawEndpointLen: config.endpoint?.length ?? 0,
    rawEndpointTail: config.endpoint ? config.endpoint.slice(-32) : "",
    resolvedEndpointLen: resolvedEndpoint.length,
    resolvedEndpointTail: resolvedEndpoint ? resolvedEndpoint.slice(-32) : "",
    hasApiKey: !!config.apiKey?.trim(),
    apiKeyLen: config.apiKey?.length ?? 0,
    rawModel: config.model,
    model,
  };
}

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
    (reason: string, opts: { force?: boolean } = {}) => {
      const summary = summarizeMindMapAIConfig(reason);
      devDebug("mindmap-open", "mindMapAiConfig push attempt", {
        ...summary,
        isBridgeReady,
        force: !!opts.force,
        lastSignature: lastSignatureRef.current,
      });
      if (!isBridgeReady) {
        devDebug("mindmap-open", "mindMapAiConfig defer: bridge not ready", {
          ...summary,
        });
        return;
      }
      const config = getCachedAIConfig().mindmap;
      const configured = isMindMapAIConfigured();
      const resolvedEndpoint = resolveMindMapAIEndpoint(config.endpoint);
      const model = config.model || "gpt-4o";
      const signature = mindMapAiConfigSignature();
      if (!opts.force && lastSignatureRef.current === signature) {
        devDebug("mindmap-open", "mindMapAiConfig unchanged", {
          ...summary,
          signature,
        });
        return;
      }
      lastSignatureRef.current = signature;
      devDebug("mindmap-open", "mindMapAiConfig push", {
        ...summary,
        configured,
        hasEndpoint: !!resolvedEndpoint,
        endpointTail: resolvedEndpoint ? resolvedEndpoint.slice(-32) : "",
        hasApiKey: !!config.apiKey?.trim(),
        keyLen: config.apiKey?.length ?? 0,
        model,
        signature,
        force: !!opts.force,
      });
      postToNative("mindMapAiConfig", {
        configured,
        api: MINDMAP_AI_PROXY_ENDPOINT,
        key: "",
        model,
        method: "POST",
        transport: MINDMAP_AI_PROXY_TRANSPORT,
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
      pushConfigIfChanged("bridge-ready", { force: true });
      return;
    }
    devDebug("mindmap-open", "mindMapAiConfig bridge not ready: reset signature");
    lastSignatureRef.current = null;
  }, [isBridgeReady, pushConfigIfChanged]);
}
