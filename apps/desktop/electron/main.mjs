import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
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
import { applyDesktopBuildFlags } from "../src/applyDesktopBuildFlags.mjs";
import { createDragPerfSampler } from "../src/dragPerfSampler.mjs";
import { createIssueDiagDesktopBridge } from "../src/issueDiagDesktopBridge.mjs";
import { applyDesktopGpuSwitches } from "../src/desktopGpuPolicy.mjs";
import { createGpuDiagnostics } from "../src/gpuDiagnostics.mjs";
import {
  ensureLoopbackServer,
  closeDispatchLoopbackServer,
} from "../src/apiDispatcher.mjs";
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
import {
  prepareDesktopPathLayout,
  resolveAppDataDir,
  resolveAppLogsDir,
  resolveCatalogRoot,
  resolveUserDataRoot,
} from "../src/desktopPaths.mjs";
import {
  isOpenableDocumentPath,
  parseOpenDocumentArgv,
} from "../src/openDocumentPaths.mjs";
import {
  editorHubHashFromUrl,
  editorHubUrlsShareAppDocument,
  normalizeEditorHubDeepLink,
  normalizeLibraryImportDeepLinkHash,
  parseEditorHubDeepLinkFromArgv,
} from "../src/parseEditorHubDeepLink.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../..");
const preloadPath = path.join(__dirname, "preload.mjs");
const desktopBuildFlags = applyDesktopBuildFlags();

const dragPerfSampler = createDragPerfSampler({
  getAppMetrics: () => app.getAppMetrics(),
  writeLog: (event, action, details) =>
    writeDesktopLog("perf", `${event}.${action}`, details),
});

const issueDiagDesktopBridge = createIssueDiagDesktopBridge({
  writeLog: (category, event, details) =>
    writeDesktopLog(category, event, details),
});

// GPU/呈现策略：必须在 app ready 之前应用（详见 desktopGpuPolicy.mjs）。
const gpuPolicy = applyDesktopGpuSwitches(app.commandLine, {
  platform: process.platform,
  env: process.env,
});

const gpuDiagnostics = createGpuDiagnostics({
  getFeatureStatus: () => app.getGPUFeatureStatus(),
  getGpuInfo: (level) => app.getGPUInfo(level),
  hasSwitch: (name) => app.commandLine.hasSwitch(name),
  writeLog: (action, details) =>
    writeDesktopLog("perf", `drag.perf.${action}`, details),
});

registerEditorHubPrivileges();
prepareDesktopPathLayout(app);

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

let pendingOpenDocumentPaths = [];
let pendingDeepLinkUrl = null;
let mainWindowContentReady = false;
/** Set after renderer pulls initial paths via consumeOpenDocumentPaths (cold start). */
let rendererOpenDocumentsReady = false;

function queueOpenDocumentPaths(paths) {
  const incoming = Array.isArray(paths) ? paths : [];
  for (const raw of incoming) {
    const trimmed = String(raw ?? "").trim();
    if (!trimmed || !isOpenableDocumentPath(trimmed)) {
      continue;
    }
    const resolved = path.resolve(trimmed);
    if (!pendingOpenDocumentPaths.includes(resolved)) {
      pendingOpenDocumentPaths.push(resolved);
    }
  }
  flushPendingOpenDocumentPaths();
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function queueDeepLinkNavigation(url) {
  const normalized = normalizeEditorHubDeepLink(url);
  if (!normalized) {
    return false;
  }
  pendingDeepLinkUrl = normalized;
  writeDiagnostic("deep-link-queued", { url: normalized.slice(0, 200) });
  flushPendingDeepLinkNavigation();
  return true;
}

function flushPendingDeepLinkNavigation() {
  if (
    !pendingDeepLinkUrl ||
    !mainWindowContentReady ||
    !mainWindow ||
    mainWindow.isDestroyed()
  ) {
    return;
  }
  const targetUrl = pendingDeepLinkUrl;
  pendingDeepLinkUrl = null;
  const webContents = mainWindow.webContents;
  const currentUrl = webContents.getURL();
  writeDiagnostic("deep-link-dispatch", {
    targetUrl: targetUrl.slice(0, 200),
    currentUrl: currentUrl.slice(0, 200),
    hasAddLibrary: targetUrl.includes("addLibrary"),
  });

  const navigate = () => {
    if (
      editorHubUrlsShareAppDocument(currentUrl, targetUrl) &&
      !webContents.isLoading()
    ) {
      const rawHash = editorHubHashFromUrl(targetUrl);
      const { navigationHash, tokens } =
        normalizeLibraryImportDeepLinkHash(rawHash);
      writeDiagnostic("deep-link-normalized", {
        navigationHash: navigationHash.slice(0, 120),
        hasTokens: !!tokens,
      });
      void webContents
        .executeJavaScript(
          `(function () {
            const nav = ${JSON.stringify(navigationHash)};
            const tokens = ${JSON.stringify(tokens)};
            const base = window.location.pathname + window.location.search;
            const next = nav ? base + nav : base;
            const current = base + (window.location.hash || "");
            if (current !== next) {
              window.history.replaceState({}, document.title, next);
            }
            if (tokens) {
              window.dispatchEvent(
                new CustomEvent("editorhub:library-url-import-deep-link", {
                  detail: tokens,
                }),
              );
            }
          })();`,
        )
        .catch((error) => {
          writeDiagnostic("deep-link-hash-nav-failed", {
            message: formatDesktopError(error),
          });
          void webContents.loadURL(targetUrl);
        });
      return;
    }
    void webContents.loadURL(targetUrl);
  };

  navigate();
  focusMainWindow();
}

function flushPendingOpenDocumentPaths() {
  if (
    !mainWindowContentReady ||
    !rendererOpenDocumentsReady ||
    !mainWindow ||
    mainWindow.isDestroyed() ||
    pendingOpenDocumentPaths.length === 0
  ) {
    return;
  }
  const paths = [...pendingOpenDocumentPaths];
  pendingOpenDocumentPaths = [];
  mainWindow.webContents.send("editorhub:open-document-paths", { paths });
  writeDiagnostic("open-document-paths-dispatch", { count: paths.length });
}

let desktopServer;
let desktopBackend;
let detachCatalogIpcBridge = () => {};
let mainWindow;
let mainWindowCloseAllowed = false;
let windowCloseAwaitingRenderer = false;
let firstWindowCloseRequestedAt = null;
let windowCloseRequestCount = 0;
let diagnosticLogPath;
let currentDesktopConfig;

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

function elapsedSince(startedAt) {
  return typeof startedAt === "number" ? Date.now() - startedAt : null;
}

function forceAllowWindowClose(reason) {
  windowCloseAwaitingRenderer = false;
  writeDiagnostic("window-close-force", {
    reason,
    requestCount: windowCloseRequestCount,
    sinceFirstRequestMs: elapsedSince(firstWindowCloseRequestedAt),
  });
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindowCloseAllowed = true;
  mainWindow.close();
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
  const serverDataDir = resolveAppDataDir(app);
  const serverLogDir = resolveAppLogsDir(app);
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

function resolveDesktopWindowIconCandidates() {
  const candidates = [
    path.join(__dirname, "../build/icon.png"),
    path.join(__dirname, "../build/icon.ico"),
    path.join(projectRoot, "public/maskable_icon_x512.png"),
    path.join(projectRoot, "public/android-chrome-192x192.png"),
    path.join(projectRoot, "public/favicon-32x32.png"),
  ];
  if (app.isPackaged) {
    candidates.unshift(
      path.join(process.resourcesPath, "icons/maskable_icon_x512.png"),
      path.join(process.resourcesPath, "icons/app-icon.png"),
    );
  }
  return candidates.filter((candidate) => existsSync(candidate));
}

function loadDesktopWindowIcon() {
  for (const iconPath of resolveDesktopWindowIconCandidates()) {
    const image = nativeImage.createFromPath(iconPath);
    if (!image.isEmpty()) {
      return image;
    }
  }
  return null;
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

const SHELL_PAGE_BACKGROUND = {
  light: "#f8fcff",
  dark: "#121212",
};

function shellThemePersistPath() {
  return path.join(resolveUserDataRoot(), "shell-theme.json");
}

function readPersistedShellTheme() {
  try {
    const raw = readFileSync(shellThemePersistPath(), "utf8");
    const parsed = JSON.parse(raw);
    return parsed?.theme === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function shellThemeBackground(theme) {
  return SHELL_PAGE_BACKGROUND[theme === "dark" ? "dark" : "light"];
}

let currentShellThemeBackground = shellThemeBackground(readPersistedShellTheme());

function applyMainWindowShellBackground() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setBackgroundColor(currentShellThemeBackground);
  }
}

function attachMainWindowHandlers() {
  if (!mainWindow) {
    return;
  }
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
      writeDiagnostic("window-close-while-loading", {
        requestCount: windowCloseRequestCount,
      });
      return;
    }
    event.preventDefault();
    if (firstWindowCloseRequestedAt == null) {
      firstWindowCloseRequestedAt = Date.now();
      windowCloseRequestCount = 0;
    }
    windowCloseRequestCount += 1;
    writeDiagnostic("window-close-requested", {
      requestCount: windowCloseRequestCount,
      sinceFirstRequestMs: elapsedSince(firstWindowCloseRequestedAt),
    });
    windowCloseAwaitingRenderer = true;
    webContents.send("desktop:windowCloseRequested");
  });
  mainWindow.on("closed", () => {
    windowCloseAwaitingRenderer = false;
    mainWindowCloseAllowed = false;
    firstWindowCloseRequestedAt = null;
    windowCloseRequestCount = 0;
    mainWindowContentReady = false;
    rendererOpenDocumentsReady = false;
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
  mainWindow.webContents.on("did-finish-load", () => {
    writeDiagnostic("webcontents-did-finish-load", {
      url: mainWindow?.webContents.getURL(),
    });
    mainWindowContentReady = true;
    flushPendingDeepLinkNavigation();
  });
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
    if (windowCloseAwaitingRenderer) {
      forceAllowWindowClose("render-process-gone");
    }
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

  if (desktopBuildFlags.debugPack) {
    // 应用菜单被置空（Menu.setApplicationMenu(null)），默认的 DevTools 快捷键也随之失效。
    // Debug 包补回一个开关：F12 或 Ctrl/Cmd+Shift+I 切换；设置
    // EDITORHUB_DESKTOP_OPEN_DEVTOOLS=1 时随窗口加载完成自动打开。
    mainWindow.webContents.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown") {
        return;
      }
      const key = String(input.key ?? "").toLowerCase();
      const isToggleDevTools =
        key === "f12" ||
        ((input.control || input.meta) && input.shift && key === "i");
      if (isToggleDevTools) {
        mainWindow?.webContents.toggleDevTools();
        event.preventDefault();
      }
    });
    if (process.env.EDITORHUB_DESKTOP_OPEN_DEVTOOLS === "1") {
      mainWindow.webContents.once("did-finish-load", () => {
        mainWindow?.webContents.openDevTools({ mode: "detach" });
      });
    }
  }

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    void shell.openExternal(targetUrl);
    return { action: "deny" };
  });

  const desktopUserAgent = `${mainWindow.webContents.getUserAgent()} EditorHub/${app.getVersion()}`;
  mainWindow.webContents.setUserAgent(desktopUserAgent);
}

function ensureMainWindowShell() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }
  writeDiagnostic("window-create-start", { preloadPath });
  const windowIcon = loadDesktopWindowIcon();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "EditorHub",
    show: false,
    backgroundColor: currentShellThemeBackground,
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
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  });
  attachMainWindowHandlers();
  writeDiagnostic("window-early-show");
  mainWindow.show();
  return mainWindow;
}

async function loadMainWindowUrl(url) {
  ensureMainWindowShell();
  writeDiagnostic("window-load-url-start", { url });
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

async function createMainWindow(url) {
  await loadMainWindowUrl(url);
}

async function startDesktopApp() {
  const startupStartedAt = Date.now();
  writeDiagnostic("startup-begin", {
    argv: process.argv,
    cwd: process.cwd(),
    resourcesPath: process.resourcesPath,
    desktopBuildFlags,
  });
  const runtimeRoot = resolveRuntimeRoot();
  process.env.EDITORHUB_DESKTOP_RUNTIME_ROOT = runtimeRoot;
  const config = parseDesktopArgs(process.argv.slice(2), {
    appBuildPath: resolveAppBuildPath(runtimeRoot),
    port: 0,
    projectRoot: runtimeRoot,
    workspacePath: resolveCatalogRoot(app),
  });
  writeDiagnostic("startup-config", {
    runtimeRoot,
    appBuildPath: config.appBuildPath,
    catalogRoot: config.workspacePath,
    host: config.host,
    port: config.port,
  });
  currentDesktopConfig = { ...config, runtimeRoot };
  writeDiagnostic("startup-phase", {
    phase: "config",
    sinceStartupMs: elapsedSince(startupStartedAt),
  });

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
  const backendStartedAt = Date.now();
  writeDiagnostic("startup-phase", {
    phase: "window-shell",
    sinceStartupMs: elapsedSince(startupStartedAt),
  });
  ensureMainWindowShell();
  const serverConfig = createDesktopServerConfig(currentDesktopConfig);
  desktopBackend = await createDesktopBackend(serverConfig);
  writeDiagnostic("startup-phase", {
    phase: "backend-ready",
    phaseMs: elapsedSince(backendStartedAt),
    sinceStartupMs: elapsedSince(startupStartedAt),
  });
  detachCatalogIpcBridge = attachCatalogIpcBridge(
    desktopBackend.catalogWatcher,
    () => mainWindow?.webContents,
  ).detach;
  const protocolStartedAt = Date.now();
  await registerEditorHubProtocol({
    buildRoot: currentDesktopConfig.appBuildPath,
    getLoopbackPort: async () => {
      const { port } = await ensureLoopbackServer(desktopBackend.app);
      return port;
    },
  });
  writeDiagnostic("startup-phase", {
    phase: "protocol-ready",
    phaseMs: elapsedSince(protocolStartedAt),
    sinceStartupMs: elapsedSince(startupStartedAt),
  });
  writeDiagnostic("server-backend-ready");
  const initialDeepLink = parseEditorHubDeepLinkFromArgv(process.argv);
  const url = initialDeepLink ?? EDITORHUB_APP_INDEX_URL;
  desktopServer = { app: desktopBackend.app, url };
  writeDiagnostic("protocol-load-url", { url });
  const windowStartedAt = Date.now();
  await loadMainWindowUrl(url);
  writeDiagnostic("startup-phase", {
    phase: "window-created",
    phaseMs: elapsedSince(windowStartedAt),
    sinceStartupMs: elapsedSince(startupStartedAt),
  });
  gpuDiagnostics.log({ appliedGpuSwitches: gpuPolicy.applied });
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
  const pathValue = typeof request.path === "string" ? request.path.trim() : "";
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

ipcMain.handle("editorhub:dragPerf", (_event, payload = {}) => {
  return dragPerfSampler.handle(payload);
});

ipcMain.handle("editorhub:issueDiag", (_event, payload = {}) => {
  return issueDiagDesktopBridge.handle(payload);
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

ipcMain.handle("desktop:getAppDataDirectoryPath", () =>
  resolveUserDataRoot(app),
);

ipcMain.handle("desktop:consumeOpenDocumentPaths", () => {
  rendererOpenDocumentsReady = true;
  const paths = [...pendingOpenDocumentPaths];
  pendingOpenDocumentPaths = [];
  flushPendingOpenDocumentPaths();
  return paths;
});

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
  windowCloseAwaitingRenderer = false;
  const allow = payload?.allow === true;
  writeDiagnostic("window-close-finished", {
    allow,
    requestCount: windowCloseRequestCount,
    sinceFirstRequestMs: elapsedSince(firstWindowCloseRequestedAt),
  });
  if (!allow || !mainWindow) {
    return false;
  }
  mainWindowCloseAllowed = true;
  mainWindow.close();
  return true;
});

ipcMain.handle("desktop:syncShellTheme", (_event, payload = {}) => {
  const theme = payload?.theme === "dark" ? "dark" : "light";
  currentShellThemeBackground = shellThemeBackground(theme);
  try {
    mkdirSync(resolveUserDataRoot(), { recursive: true });
    writeFileSync(
      shellThemePersistPath(),
      JSON.stringify({ theme }),
      "utf8",
    );
  } catch {
    /* ignore persist errors */
  }
  applyMainWindowShellBackground();
  return { ok: true };
});

ipcMain.handle("desktop:windowIsMaximized", () => {
  return mainWindow?.isMaximized() ?? false;
});

if (gotSingleInstanceLock) {
  app.on("second-instance", (_event, argv) => {
    const deepLink = parseEditorHubDeepLinkFromArgv(argv);
    if (deepLink) {
      queueDeepLinkNavigation(deepLink);
    } else {
      queueOpenDocumentPaths(parseOpenDocumentArgv(argv));
      focusMainWindow();
    }
  });

  app.on("open-file", (event, filePath) => {
    event.preventDefault();
    queueOpenDocumentPaths([filePath]);
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });

  queueOpenDocumentPaths(parseOpenDocumentArgv(process.argv));

  void app
    .whenReady()
    .then(async () => {
      diagnosticLogPath = getDesktopOpLogPath();
      writeDiagnostic("app-ready", { logPath: diagnosticLogPath });
      if (process.platform === "win32") {
        app.setAppUserModelId("com.editorhub.desktop");
        if (gotSingleInstanceLock) {
          app.setAsDefaultProtocolClient("editorhub");
        }
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
} else {
  app.quit();
}
