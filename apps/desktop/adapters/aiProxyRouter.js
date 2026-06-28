import { Router } from "express";

import { readDesktopAiConfig } from "./desktopAiConfigStore.js";
import { loadRuntimeServerModule } from "./runtimeServerLib.mjs";

/** Desktop AI proxy — reads JSON ai-settings, no SQLite. */
export async function createDesktopAiProxyRouter() {
  const {
    buildAIProxyChatRequest,
    buildAIProxyVisionRequest,
    jsonProxyResponse,
    streamProxyResponse,
  } = await loadRuntimeServerModule("lib/aiProxy.js");

  const router = Router();

  router.post("/chat", async (req, res) => {
    try {
      const proxyRequest = buildAIProxyChatRequest(
        await readDesktopAiConfig(),
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
        await readDesktopAiConfig(),
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
