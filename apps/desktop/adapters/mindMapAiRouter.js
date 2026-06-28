import { Router } from "express";

import { readDesktopAiConfig } from "./desktopAiConfigStore.js";
import { loadRuntimeServerModule } from "./runtimeServerLib.mjs";

export async function buildMindMapAIProxyRequest(config, body = {}) {
  const { AI_PROXY_FEATURE, buildAIProxyChatRequest } =
    await loadRuntimeServerModule("lib/aiProxy.js");
  return buildAIProxyChatRequest(config, {
    ...body,
    feature: AI_PROXY_FEATURE.MINDMAP_CHAT,
    stream: true,
  });
}

/** Desktop MindMap AI proxy — JSON ai-settings, no SQLite. */
export async function createDesktopMindMapAiRouter() {
  const { AI_PROXY_FEATURE, streamProxyResponse } =
    await loadRuntimeServerModule("lib/aiProxy.js");

  const router = Router();

  router.post("/chat", async (req, res) => {
    try {
      const proxyRequest = await buildMindMapAIProxyRequest(
        await readDesktopAiConfig(),
        {
          ...req.body,
          stream: true,
        },
      );
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
