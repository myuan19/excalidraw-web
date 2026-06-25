import { Router } from "express";

import {
  readDesktopAiConfig,
  writeDesktopAiConfig,
} from "./desktopAiConfigStore.js";

/** Desktop 本地 AI 配置：JSON 文件持久化，不依赖 better-sqlite3。 */
export function createDesktopAiSettingsRouter() {
  const router = Router();

  router.get("/", (_req, res) => {
    try {
      return res.json(readDesktopAiConfig());
    } catch (error) {
      return res.status(500).json({
        error: "failed to read ai settings",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.put("/", (req, res) => {
    try {
      writeDesktopAiConfig(req.body);
      return res.json(readDesktopAiConfig());
    } catch (error) {
      return res.status(500).json({
        error: "failed to save ai settings",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
