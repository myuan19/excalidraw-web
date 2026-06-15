import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

import { createFolderMappingRouter } from "../adapters/folderMapping/router.js";
import { writeDesktopLog } from "./desktopLogger.mjs";

const DESKTOP_SOURCE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

async function loadCreateApp(config) {
  const runtimeRoot =
    config.runtimeRoot ||
    process.env.EDITORHUB_DESKTOP_RUNTIME_ROOT ||
    DESKTOP_SOURCE_ROOT;
  const createAppPath = path.join(runtimeRoot, "server/createApp.js");
  const { createApp } = await import(pathToFileURL(createAppPath).href);
  return createApp;
}

export async function createDesktopServer(config) {
  writeDesktopLog("server", "create-begin", {
    workspacePath: config.workspacePath,
    appBuildPath: config.appBuildPath,
    host: config.host,
    port: config.port,
    runtimeRoot: config.runtimeRoot ?? process.env.EDITORHUB_DESKTOP_RUNTIME_ROOT ?? "",
  });
  const filesRouter = await createFolderMappingRouter({
    workspacePath: config.workspacePath,
  });
  const createApp = await loadCreateApp(config);

  return createApp({
    filesRouter,
    includeDefaultRoutes: false,
    serveSpa: config.appBuildPath,
  });
}

export async function listenDesktopServer(config) {
  const app = await createDesktopServer(config);
  return new Promise((resolve, reject) => {
    const server = app.listen(config.port, config.host, () => {
      const address = server.address();
      const port =
        address && typeof address === "object" ? address.port : config.port;
      server.off("error", reject);
      const url = `http://${config.host}:${port}`;
      writeDesktopLog("server", "listen-ready", { url, host: config.host, port });
      resolve({
        app,
        server,
        url,
      });
    });
    server.once("error", (error) => {
      writeDesktopLog("server", "listen-error", { message: error.message });
      reject(error);
    });
  });
}
