import { existsSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { app, BrowserWindow, dialog, shell } from "electron";

import { listenDesktopServer } from "../src/bootstrapServer.mjs";
import { parseDesktopArgs } from "../src/config.mjs";
import {
  applyDesktopServerLogEnv,
  configureDesktopLogPaths,
  formatDesktopError,
  getDesktopOpLogPath,
  writeDesktopLog,
} from "../src/desktopLogger.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../..");
const preloadPath = path.join(__dirname, "preload.mjs");

let desktopServer;
let mainWindow;
let diagnosticLogPath;

function uniquePaths(paths) {
  return [...new Set(paths.filter(Boolean))];
}

function formatDiagnosticValue(value) {
  return formatDesktopError(value);
}

function writeDiagnostic(event, details = {}) {
  writeDesktopLog("main", event, details);
}

function showStartupError(message, error) {
  writeDiagnostic("startup-error", { message, error: formatDiagnosticValue(error) });
  return dialog.showMessageBox({
    type: "error",
    title: "EditorHub",
    message,
    detail: error instanceof Error ? error.stack || error.message : String(error),
  });
}

function resolveDefaultWorkspace() {
  const workspacePath = path.join(app.getPath("userData"), "workspace");
  mkdirSync(workspacePath, { recursive: true });
  return workspacePath;
}

function configureServerEnvironment() {
  const serverDataDir = path.join(app.getPath("userData"), "server-data");
  const serverLogDir = path.join(app.getPath("userData"), "logs");
  mkdirSync(serverDataDir, { recursive: true });
  mkdirSync(serverLogDir, { recursive: true });
  configureDesktopLogPaths(() => {
    const envDir = process.env.EDITORHUB_DESKTOP_LOG_DIR;
    const appDataDir =
      process.env.APPDATA && path.join(process.env.APPDATA, "EditorHub", "logs");
    const localAppDataDir =
      process.env.LOCALAPPDATA &&
      path.join(process.env.LOCALAPPDATA, "EditorHub", "logs");
    const tempDir =
      process.env.TEMP && path.join(process.env.TEMP, "EditorHub", "logs");
    return uniquePaths([envDir, serverLogDir, appDataDir, localAppDataDir, tempDir]);
  });
  applyDesktopServerLogEnv({ dataDir: serverDataDir, logDir: serverLogDir });
  diagnosticLogPath = getDesktopOpLogPath();
  writeDiagnostic("server-environment-configured", {
    dataDir: process.env.EXCALIDRAW_DATA_DIR,
    logDir: process.env.EXCALIDRAW_LOG_DIR,
    opLogPath: diagnosticLogPath,
  });
}

function resolveRuntimeRoot() {
  return app.isPackaged ? path.join(app.getAppPath(), ".runtime") : projectRoot;
}

function resolveAppBuildPath(runtimeRoot) {
  return app.isPackaged
    ? path.join(process.resourcesPath, "apps/web/build")
    : path.join(runtimeRoot, "apps/web/build");
}

async function createMainWindow(url) {
  writeDiagnostic("window-create-start", { url, preloadPath });
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "EditorHub",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    writeDiagnostic("window-ready-to-show");
    mainWindow.show();
  });
  mainWindow.once("show", () => writeDiagnostic("window-shown"));
  mainWindow.once("closed", () => writeDiagnostic("window-closed"));
  mainWindow.on("unresponsive", () => writeDiagnostic("window-unresponsive"));
  mainWindow.on("responsive", () => writeDiagnostic("window-responsive"));
  mainWindow.webContents.on("did-start-loading", () =>
    writeDiagnostic("webcontents-did-start-loading"),
  );
  mainWindow.webContents.on("dom-ready", () => writeDiagnostic("webcontents-dom-ready"));
  mainWindow.webContents.on("did-finish-load", () =>
    writeDiagnostic("webcontents-did-finish-load", {
      url: mainWindow?.webContents.getURL(),
    }),
  );
  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      writeDiagnostic("webcontents-did-fail-load", {
        errorCode,
        errorDescription,
        validatedURL,
      });
    },
  );
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    writeDiagnostic("webcontents-render-process-gone", details);
  });
  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level < 2) {
      return;
    }
    writeDiagnostic("webcontents-console-message", {
      level,
      message,
      line,
      sourceId,
    });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    void shell.openExternal(targetUrl);
    return { action: "deny" };
  });

  await mainWindow.loadURL(url);
  writeDiagnostic("window-load-url-resolved", {
    visible: mainWindow.isVisible(),
    url: mainWindow.webContents.getURL(),
  });
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      writeDiagnostic("window-force-show-after-timeout", {
        url: mainWindow.webContents.getURL(),
      });
      mainWindow.show();
    }
  }, 5000);
}

async function startDesktopApp() {
  writeDiagnostic("startup-begin", {
    argv: process.argv,
    cwd: process.cwd(),
    resourcesPath: process.resourcesPath,
  });
  const runtimeRoot = resolveRuntimeRoot();
  const config = parseDesktopArgs(process.argv.slice(2), {
    appBuildPath: resolveAppBuildPath(runtimeRoot),
    port: 0,
    projectRoot: runtimeRoot,
    workspacePath: resolveDefaultWorkspace(),
  });
  writeDiagnostic("startup-config", {
    runtimeRoot,
    appBuildPath: config.appBuildPath,
    workspacePath: config.workspacePath,
    host: config.host,
    port: config.port,
  });

  if (!existsSync(path.join(config.appBuildPath, "index.html"))) {
    await showStartupError(
      "缺少桌面端 Web 构建产物",
      new Error(
        `未找到 ${path.join(config.appBuildPath, "index.html")}。\n请先运行 yarn build:desktop。`,
      ),
    );
    app.quit();
    return;
  }

  configureServerEnvironment();
  writeDiagnostic("server-listen-start");
  desktopServer = await listenDesktopServer({
    ...config,
    runtimeRoot,
  });
  writeDiagnostic("server-listen-ready", { url: desktopServer.url });
  await createMainWindow(desktopServer.url);
}

app.on("window-all-closed", () => {
  writeDiagnostic("app-window-all-closed");
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  writeDiagnostic("app-before-quit");
  desktopServer?.server?.close();
});

app.on("activate", () => {
  writeDiagnostic("app-activate");
  if (BrowserWindow.getAllWindows().length === 0 && desktopServer?.url) {
    void createMainWindow(desktopServer.url);
  }
});

process.on("uncaughtException", async (error) => {
  writeDiagnostic("process-uncaught-exception", error);
  if (app.isReady()) {
    await showStartupError("桌面端发生未捕获异常", error);
  }
  app.quit();
});

process.on("unhandledRejection", (reason) => {
  writeDiagnostic("process-unhandled-rejection", formatDiagnosticValue(reason));
});

writeDiagnostic("main-module-loaded", {
  argv: process.argv,
  cwd: process.cwd(),
  execPath: process.execPath,
  resourcesPath: process.resourcesPath,
  versions: process.versions,
});

app.on("will-finish-launching", () => writeDiagnostic("app-will-finish-launching"));
app.on("ready", () => writeDiagnostic("app-ready-event"));

void app
  .whenReady()
  .then(async () => {
    diagnosticLogPath = getDesktopOpLogPath();
    writeDiagnostic("app-ready", { logPath: diagnosticLogPath });
    try {
      await startDesktopApp();
    } catch (error) {
      await showStartupError("桌面端启动失败", error);
      app.quit();
    }
  })
  .catch(async (error) => {
    await showStartupError("Electron ready 阶段失败", error);
    app.quit();
  });
