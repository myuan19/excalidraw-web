import { Router } from "express";

import {
  AI_PROXY_FEATURE,
  buildAIProxyChatRequest,
  buildAIProxyVisionRequest,
  streamProxyResponse,
} from "../../../server/lib/aiProxy.js";

import { readDesktopAiConfig } from "./desktopAiConfigStore.js";

export function buildMindMapAIProxyRequest(config, body = {}) {
  return buildAIProxyChatRequest(config, {
    ...body,
    feature: AI_PROXY_FEATURE.MINDMAP_CHAT,
    stream: true,
  });
}

/** Desktop MindMap AI proxy — JSON ai-settings, no SQLite. */
export function createDesktopMindMapAiRouter() {
  const router = Router();

  router.post("/chat", async (req, res) => {
    try {
      const proxyRequest = buildMindMapAIProxyRequest(readDesktopAiConfig(), {
        ...req.body,
        stream: true,
      });
      return streamProxyResponse(proxyRequest, req, res);
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }
      const status = Number(error?.status) || 500;
      return res.status(status).json({
        error: error?.message || "mindmap_ai_proxy_failed",
      });
    }
  });

  return router;
}

export { AI_PROXY_FEATURE };
