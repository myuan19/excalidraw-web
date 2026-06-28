import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

import { createFolderMappingRouter } from "../adapters/folderMapping/router.js";
import { createDesktopAiPromptPresetsRouter } from "../adapters/aiPromptPresetsRouter.js";
import { createDesktopAiProxyRouter } from "../adapters/aiProxyRouter.js";
import { createDesktopAiSettingsRouter } from "../adapters/aiSettingsRouter.js";
import { createDesktopLibraryRouter } from "../adapters/libraryRouter.js";
import { createDesktopMindMapAiRouter } from "../adapters/mindMapAiRouter.js";
import { ensureDesktopAiSettingsConfig } from "../adapters/desktopAiConfigStore.js";
import { createDesktopTtdChatsRouter } from "../adapters/ttdChatsRouter.js";
import {
  closeDispatchLoopbackServer,
  dispatchExpressRequest,
} from "./apiDispatcher.mjs";
import { writeDesktopLog } from "./desktopLogger.mjs";

const DESKTOP_SOURCE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

async function loadRuntimeModule(config, relativePath) {
  const runtimeRoot =
    config.runtimeRoot ||
    process.env.EDITORHUB_DESKTOP_RUNTIME_ROOT ||
    DESKTOP_SOURCE_ROOT;
  const modulePath = path.join(runtimeRoot, relativePath);
  return import(pathToFileURL(modulePath).href);
}

async function loadCreateApp(config) {
  const { createApp } = await loadRuntimeModule(config, "server/createApp.js");
  return createApp;
}

async function loadCreateLogsRouter(config) {
  const { createLogsRouter } = await loadRuntimeModule(
    config,
    "server/routes/logs.js",
  );
  return createLogsRouter;
}

async function loadDefaultRouter(config, relativePath) {
  const module = await loadRuntimeModule(config, relativePath);
  return module.default;
}

export async function assembleDesktopExpressApp(config) {
  writeDesktopLog("server", "assemble-begin", {
    workspacePath: config.workspacePath,
    appBuildPath: config.appBuildPath,
    runtimeRoot:
      config.runtimeRoot ?? process.env.EDITORHUB_DESKTOP_RUNTIME_ROOT ?? "",
  });

  const filesRouter = await createFolderMappingRouter({
    workspacePath: config.workspacePath,
    openLocalPath: config.openLocalPath,
    showLocalItemInFolder: config.showLocalItemInFolder,
  });
  const catalogWatcher = filesRouter.catalogWatcher;

  const createApp = await loadCreateApp(config);
  const createLogsRouter = await loadCreateLogsRouter(config);
  await ensureDesktopAiSettingsConfig();
  const aiSettingsRouter = createDesktopAiSettingsRouter();
  const aiPromptPresetsRouter = createDesktopAiPromptPresetsRouter();
  const logsRouter = createLogsRouter({
    openLocalPath: config.openLocalPath,
    showLocalItemInFolder: config.showLocalItemInFolder,
  });
  const libraryRouter = createDesktopLibraryRouter();
  const aiProxyRouter = await createDesktopAiProxyRouter();
  const mindMapAiRouter = await createDesktopMindMapAiRouter();
  const ttdChatsRouter = createDesktopTtdChatsRouter();

  const app = await createApp({
    filesRouter,
    logsRouter,
    libraryRouter,
    ttdChatsRouter,
    aiSettingsRouter,
    aiPromptPresetsRouter,
    aiProxyRouter,
    mindMapAiRouter,
    includeDefaultRoutes: false,
    serveSpa: config.appBuildPath,
  });

  return {
    app,
    filesRouter,
    catalogWatcher,
  };
}

/**
 * Desktop backend without a fixed public port — IPC dispatch uses internal loopback.
 */
export async function createDesktopBackend(config) {
  const { app, catalogWatcher } = await assembleDesktopExpressApp(config);

  return {
    app,
    catalogWatcher,
    dispatchApi: (request) => dispatchExpressRequest(app, request),
    async close() {
      catalogWatcher?.close?.();
      await closeDispatchLoopbackServer(app);
    },
  };
}
