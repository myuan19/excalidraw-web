import { Router } from "express";

import {
  buildAIProxyChatRequest,
  buildAIProxyVisionRequest,
  jsonProxyResponse,
  streamProxyResponse,
} from "../../../server/lib/aiProxy.js";

import { readDesktopAiConfig } from "./desktopAiConfigStore.js";

/** Desktop AI proxy — reads JSON ai-settings, no SQLite. */
export function createDesktopAiProxyRouter() {
  const router = Router();

  router.post("/chat", async (req, res) => {
    try {
      const proxyRequest = buildAIProxyChatRequest(
        readDesktopAiConfig(),
        req.body,
      );
      return streamProxyResponse(proxyRequest, req, res);
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }
      const status = Number(error?.status) || 500;
      return res.status(status).json({
        error: error?.message || "ai_proxy_failed",
      });
    }
  });

  router.post("/vision", async (req, res) => {
    try {
      const proxyRequest = buildAIProxyVisionRequest(
        readDesktopAiConfig(),
        req.body,
      );
      return jsonProxyResponse(proxyRequest, req, res);
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }
      const status = Number(error?.status) || 500;
      return res.status(status).json({
        error: error?.message || "ai_proxy_failed",
      });
    }
  });

  return router;
}
