import { Router } from "express";

import db from "../db.js";
import {
  AI_PROXY_FEATURE,
  buildAIProxyChatRequest,
  readConfigAndBuildChat,
  streamProxyResponse,
} from "../lib/aiProxy.js";

const router = Router();

export function buildMindMapAIProxyRequest(config, body = {}) {
  return buildAIProxyChatRequest(config, {
    ...body,
    feature: AI_PROXY_FEATURE.MINDMAP_CHAT,
    stream: true,
  });
}

router.post("/chat", async (req, res) => {
  try {
    const proxyRequest = readConfigAndBuildChat(db, {
      ...req.body,
      feature: AI_PROXY_FEATURE.MINDMAP_CHAT,
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

export default router;
