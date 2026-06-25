import { existsSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
  app,
  BrowserWindow,
  dialog,
  shell,
  Menu,
  ipcMain,
  nativeImage,
} from "electron";

import { createDesktopBackend } from "../src/bootstrapBackend.mjs";
import { ensureLoopbackServer, closeDispatchLoopbackServer } from "../src/apiDispatcher.mjs";
import { attachCatalogIpcBridge } from "../src/catalogIpcBridge.mjs";
import {
  EDITORHUB_APP_INDEX_URL,
  registerEditorHubPrivileges,
  registerEditorHubProtocol,
} from "../src/editorHubProtocol.mjs";
import { parseDesktopArgs } from "../src/config.mjs";
import {
  applyDesktopServerLogEnv,
  configureDesktopLogPaths,
  formatDesktopError,
  getDesktopOpLogPath,
  truncDesktopStr,
  writeDesktopLog,
} from "../src/desktopLogger.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../..");
const preloadPath = path.join(__dirname, "preload.mjs");

registerEditorHubPrivileges();

let desktopServer;
let desktopBackend;
let detachCatalogIpcBridge = () => {};
let mainWindow;
let mainWindowCloseAllowed = false;
let diagnosticLogPath;
let currentDesktopConfig;

function resolveCatalogRoot() {
  const catalogRoot = path.join(app.getPath("userData"), "catalog");
  mkdirSync(catalogRoot, { recursive: true });
  return catalogRoot;
}

function resolveDefaultDataDirectory() {
  const defaultDir = path.join(app.getPath("documents"), "EditorHub");
  mkdirSync(defaultDir, { recursive: true });
  return defaultDir;
}

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
  writeDiagnostic("startup-error", {
    message,
    error: formatDiagnosticValue(error),
  });
  return dialog.showMessageBox({
    type: "error",
    title: "EditorHub",
    message,
    detail:
      error instanceof Error ? error.stack || error.message : String(error),
  });
}

function configureServerEnvironment() {
  const serverDataDir = path.join(app.getPath("userData"), "server-data");
  const serverLogDir = path.join(app.getPath("userData"), "logs");
  mkdirSync(serverDataDir, { recursive: true });
  mkdirSync(serverLogDir, { recursive: true });
  configureDesktopLogPaths(() => {
    const envDir = process.env.EDITORHUB_DESKTOP_LOG_DIR;
    const appDataDir =
      process.env.APPDATA &&
      path.join(process.env.APPDATA, "EditorHub", "logs");
    const localAppDataDir =
      process.env.LOCALAPPDATA &&
      path.join(process.env.LOCALAPPDATA, "EditorHub", "logs");
    const tempDir =
      process.env.TEMP && path.join(process.env.TEMP, "EditorHub", "logs");
    return uniquePaths([
      envDir,
      serverLogDir,
      appDataDir,
      localAppDataDir,
      tempDir,
    ]);
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

function resolveDesktopWindowIconPath() {
  const candidates = [
    path.join(projectRoot, "public/icons/drawing-space.svg"),
    path.join(projectRoot, "public/favicon.svg"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function loadDesktopWindowIcon() {
  const iconPath = resolveDesktopWindowIconPath();
  if (!iconPath) {
    return null;
  }
  const image = nativeImage.createFromPath(iconPath);
  return image.isEmpty() ? null : image;
}

function createDesktopServerConfig(config) {
  return {
    ...config,
    openLocalPath: (targetPath) => shell.openPath(targetPath),
    showLocalItemInFolder: (targetPath) => shell.showItemInFolder(targetPath),
  };
}

function closeDesktopBackend() {
  detachCatalogIpcBridge();
  detachCatalogIpcBridge = () => {};
  if (desktopBackend) {
    return desktopBackend.close();
  }
  return Promise.resolve();
}

function closeDesktopServer(serverHandle) {
  if (!serverHandle) {
    return Promise.resolve();
  }
  return closeDispatchLoopbackServer(serverHandle.app);
}

async function createMainWindow(url) {
  writeDiagnostic("window-create-start", { url, preloadPath });
  const windowIcon = loadDesktopWindowIcon();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "EditorHub",
    show: false,
    autoHideMenuBar: true,
    frame: false,
    ...(windowIcon ? { icon: windowIcon } : {}),
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
  mainWindow.on("maximize", () => {
    mainWindow?.webContents.send("desktop:windowMaximized", true);
  });
  mainWindow.on("unmaximize", () => {
    mainWindow?.webContents.send("desktop:windowMaximized", false);
  });
  mainWindow.once("show", () => writeDiagnostic("window-shown"));
  mainWindow.on("close", (event) => {
    if (mainWindowCloseAllowed) {
      return;
    }
    const webContents = mainWindow?.webContents;
    if (!webContents || webContents.isDestroyed()) {
      return;
    }
    if (webContents.isLoading()) {
      writeDiagnostic("window-close-while-loading");
      return;
    }
    event.preventDefault();
    writeDiagnostic("window-close-requested");
    webContents.send("desktop:windowCloseRequested");
  });
  mainWindow.on("closed", () => {
    mainWindowCloseAllowed = false;
    writeDiagnostic("window-closed");
    mainWindow = undefined;
  });
  mainWindow.on("unresponsive", () => writeDiagnostic("window-unresponsive"));
  mainWindow.on("responsive", () => writeDiagnostic("window-responsive"));
  mainWindow.webContents.on("did-start-loading", () =>
    writeDiagnostic("webcontents-did-start-loading"),
  );
  mainWindow.webContents.on("dom-ready", () =>
    writeDiagnostic("webcontents-dom-ready"),
  );
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
  mainWindow.webContents.on(
    "console-message",
    (_event, level, message, line, sourceId) => {
      if (level < 2) {
        return;
      }
      const text = String(message ?? "");
      // devDebug / user-trace 已走 IPC 或协议 → desktop-op.log（category: client）
      if (text.startsWith("[DEBUG]")) {
        return;
      }
      writeDiagnostic("webcontents-console-message", {
        level,
        message: truncDesktopStr(text, 2000),
        line,
        sourceId,
      });
    },
  );

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    void shell.openExternal(targetUrl);
    return { action: "deny" };
  });

  const desktopUserAgent = `${mainWindow.webContents.getUserAgent()} EditorHub/${app.getVersion()}`;
  mainWindow.webContents.setUserAgent(desktopUserAgent);

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
    workspacePath: resolveCatalogRoot(),
  });
  writeDiagnostic("startup-config", {
    runtimeRoot,
    appBuildPath: config.appBuildPath,
    catalogRoot: config.workspacePath,
    host: config.host,
    port: config.port,
  });
  currentDesktopConfig = { ...config, runtimeRoot };

  if (!existsSync(path.join(config.appBuildPath, "index.html"))) {
    await showStartupError(
      "缺少桌面端 Web 构建产物",
      new Error(
        `未找到 ${path.join(
          config.appBuildPath,
          "index.html",
        )}。\n请先运行 yarn build:desktop。`,
      ),
    );
    app.quit();
    return;
  }

  configureServerEnvironment();
  writeDiagnostic("server-backend-start");
  const serverConfig = createDesktopServerConfig(currentDesktopConfig);
  desktopBackend = await createDesktopBackend(serverConfig);
  detachCatalogIpcBridge = attachCatalogIpcBridge(
    desktopBackend.catalogWatcher,
    () => mainWindow?.webContents,
  ).detach;
  await registerEditorHubProtocol({
    buildRoot: currentDesktopConfig.appBuildPath,
    getLoopbackPort: async () => {
      const { port } = await ensureLoopbackServer(desktopBackend.app);
      return port;
    },
  });
  writeDiagnostic("server-backend-ready");
  const url = EDITORHUB_APP_INDEX_URL;
  desktopServer = { app: desktopBackend.app, url };
  writeDiagnostic("protocol-load-url", { url });
  await createMainWindow(url);
}

app.on("window-all-closed", () => {
  writeDiagnostic("app-window-all-closed");
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  writeDiagnostic("app-before-quit");
  void closeDesktopServer(desktopServer);
  void closeDesktopBackend();
});

app.on("activate", () => {
  writeDiagnostic("app-activate");
  if (BrowserWindow.getAllWindows().length === 0) {
    void createMainWindow(EDITORHUB_APP_INDEX_URL);
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

app.on("will-finish-launching", () =>
  writeDiagnostic("app-will-finish-launching"),
);
app.on("ready", () => writeDiagnostic("app-ready-event"));

ipcMain.handle("editorhub:api", async (_event, request = {}) => {
  if (!desktopBackend?.dispatchApi) {
    throw new Error("Desktop backend is not ready");
  }
  const pathValue =
    typeof request.path === "string" ? request.path.trim() : "";
  if (!pathValue) {
    throw new Error("editorhub:api requires a non-empty path");
  }
  return desktopBackend.dispatchApi({
    method: typeof request.method === "string" ? request.method : "GET",
    path: pathValue,
    headers:
      request.headers && typeof request.headers === "object"
        ? request.headers
        : {},
    body:
      request.body === undefined || request.body === null
        ? null
        : String(request.body),
  });
});

ipcMain.handle("desktop:pickFolder", async () => {
  const result = await dialog.showOpenDialog({
    defaultPath: app.getPath("documents"),
    properties: ["openDirectory", "dontAddToRecent"],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0] ?? null;
});

ipcMain.handle("desktop:getDefaultDataDirectoryPath", () =>
  resolveDefaultDataDirectory(),
);

ipcMain.handle("desktop:openPath", async (_event, targetPath) => {
  if (typeof targetPath !== "string" || !targetPath.trim()) {
    return "invalid path";
  }
  return shell.openPath(targetPath.trim());
});

ipcMain.handle("desktop:showSaveDialog", async (_event, options = {}) => {
  const extension =
    typeof options.extension === "string"
      ? options.extension.replace(/^\./, "")
      : "excalidraw";
  const rawName =
    typeof options.defaultName === "string" && options.defaultName.trim()
      ? options.defaultName.trim()
      : "Untitled";
  const defaultName = rawName.toLowerCase().endsWith(`.${extension}`)
    ? rawName
    : `${rawName}.${extension}`;
  const result = await dialog.showSaveDialog({
    title: typeof options.title === "string" ? options.title : "保存文件",
    defaultPath: path.join(app.getPath("documents"), defaultName),
    filters: [
      {
        name: extension.toUpperCase(),
        extensions: [extension],
      },
    ],
    properties: ["createDirectory", "showOverwriteConfirmation"],
  });
  return result.canceled ? null : result.filePath ?? null;
});

ipcMain.handle("desktop:windowMinimize", () => {
  mainWindow?.minimize();
});

ipcMain.handle("desktop:windowToggleMaximize", () => {
  if (!mainWindow) {
    return false;
  }
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
  return mainWindow.isMaximized();
});

ipcMain.handle("desktop:windowClose", () => {
  mainWindow?.close();
});

ipcMain.handle("desktop:requestWindowClose", () => {
  mainWindow?.close();
});

ipcMain.handle("desktop:finishWindowClose", (_event, payload = {}) => {
  const allow = payload?.allow === true;
  writeDiagnostic("window-close-finished", { allow });
  if (!allow || !mainWindow) {
    return false;
  }
  mainWindowCloseAllowed = true;
  mainWindow.close();
  return true;
});

ipcMain.handle("desktop:windowIsMaximized", () => {
  return mainWindow?.isMaximized() ?? false;
});

void app
  .whenReady()
  .then(async () => {
    diagnosticLogPath = getDesktopOpLogPath();
    writeDiagnostic("app-ready", { logPath: diagnosticLogPath });
    if (process.platform === "win32") {
      app.setAppUserModelId("com.editorhub.desktop");
    }
    const appIcon = loadDesktopWindowIcon();
    if (appIcon && process.platform === "darwin" && app.dock) {
      app.dock.setIcon(appIcon);
    }
    Menu.setApplicationMenu(null);
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
