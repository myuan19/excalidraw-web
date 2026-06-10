import { Router } from "express";

import db from "../db.js";
import {
  AI_PROXY_FEATURE,
  buildAIProxyChatRequest,
  buildAIProxyVisionRequest,
  jsonProxyResponse,
  readConfigAndBuildChat,
  readConfigAndBuildVision,
  streamProxyResponse,
} from "../lib/aiProxy.js";

const router = Router();

router.post("/chat", async (req, res) => {
  try {
    const proxyRequest = readConfigAndBuildChat(db, req.body);
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
    const proxyRequest = readConfigAndBuildVision(db, req.body);
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

export { AI_PROXY_FEATURE, buildAIProxyChatRequest, buildAIProxyVisionRequest };

export default router;
