/**

 * Desktop application data layout — aligned with Electron / platformdirs conventions.

 *

 * | Kind | Windows | macOS | Linux |

 * |------|---------|-------|-------|

 * | Config + app state (userData) | %APPDATA%\EditorHub\ | ~/Library/Application Support/EditorHub/ | ~/.config/EditorHub/ |

 * | User documents (default save) | %USERPROFILE%\Documents\EditorHub\ | ~/Documents/EditorHub/ | ~/Documents/EditorHub/ |

 * | Cache (Chromium) | %LOCALAPPDATA%\EditorHub\cache\ | ~/Library/Caches/EditorHub/cache/ | $XDG_CACHE_HOME/EditorHub/cache/ |

 * | Logs | %LOCALAPPDATA%\EditorHub\logs\ | ~/Library/Logs/EditorHub/ | $XDG_STATE_HOME/EditorHub/logs/ |

 *

 * Under userData (never write app JSON directly to userData root — Electron/Chromium conflict):

 *   data\     — EXCALIDRAW_DATA_DIR (AI、素材库、聊天等)

 *   catalog\  — 目录映射索引 (.editorhub)

 */

import { existsSync, mkdirSync } from "node:fs";

import path from "node:path";



export const DESKTOP_PRODUCT_NAME = "EditorHub";



export const DESKTOP_DATA_SUBDIR = "data";

export const DESKTOP_CATALOG_SUBDIR = "catalog";

export const DESKTOP_LOGS_SUBDIR = "logs";

export const DESKTOP_CACHE_SUBDIR = "cache";

export const CATALOG_SIDECAR_DIR = ".editorhub";



export function resolveUserDataRoot(app) {
  if (pinnedUserDataRoot) {
    return pinnedUserDataRoot;
  }
  return app.getPath("userData");
}

/** Electron 默认 userData 根（不经过 app.getPath，避免 setPath('cache') 后路径漂移）。 */
export function resolveDefaultUserDataRoot() {
  if (process.platform === "win32" && process.env.APPDATA) {
    return path.join(process.env.APPDATA, DESKTOP_PRODUCT_NAME);
  }
  if (process.platform === "darwin" && process.env.HOME) {
    return path.join(
      process.env.HOME,
      "Library",
      "Application Support",
      DESKTOP_PRODUCT_NAME,
    );
  }
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  if (xdgConfig) {
    return path.join(xdgConfig, DESKTOP_PRODUCT_NAME);
  }
  const home = process.env.HOME;
  if (home) {
    return path.join(home, ".config", DESKTOP_PRODUCT_NAME);
  }
  return null;
}

let pinnedUserDataRoot = null;

export function pinDesktopUserDataRoot(app) {
  if (pinnedUserDataRoot) {
    return pinnedUserDataRoot;
  }
  const userData = resolveDefaultUserDataRoot() ?? app.getPath("userData");
  pinnedUserDataRoot = userData;
  if (!app.isReady()) {
    try {
      app.setPath("userData", userData);
    } catch {
      // ignore — setPath may fail if already configured
    }
  }
  return userData;
}

/** @internal Vitest only */
export function resetDesktopPathLayoutForTests() {
  pinnedUserDataRoot = null;
}



export function resolveAppDataDir(app) {

  return path.join(resolveUserDataRoot(app), DESKTOP_DATA_SUBDIR);

}



export function resolveCatalogRoot(app) {

  return path.join(resolveUserDataRoot(app), DESKTOP_CATALOG_SUBDIR);

}



export function resolveCatalogSidecarDir(app) {

  return path.join(resolveCatalogRoot(app), CATALOG_SIDECAR_DIR);

}



export function resolveAppLogsDir(app) {

  if (process.platform === "win32" && process.env.LOCALAPPDATA) {

    return path.join(

      process.env.LOCALAPPDATA,

      DESKTOP_PRODUCT_NAME,

      DESKTOP_LOGS_SUBDIR,

    );

  }

  if (process.platform === "darwin" && process.env.HOME) {

    return path.join(

      process.env.HOME,

      "Library",

      "Logs",

      DESKTOP_PRODUCT_NAME,

    );

  }

  const xdgState = process.env.XDG_STATE_HOME;

  if (xdgState) {

    return path.join(xdgState, DESKTOP_PRODUCT_NAME, DESKTOP_LOGS_SUBDIR);

  }

  const home = process.env.HOME;

  if (home) {

    return path.join(

      home,

      ".local",

      "state",

      DESKTOP_PRODUCT_NAME,

      DESKTOP_LOGS_SUBDIR,

    );

  }

  const localRoot = resolveLocalVendorRoot();

  if (localRoot) {

    return path.join(localRoot, DESKTOP_LOGS_SUBDIR);

  }

  return path.join(resolveUserDataRoot(app), DESKTOP_LOGS_SUBDIR);

}



/** Machine-local vendor root for cache (not roaming). */

export function resolveLocalVendorRoot() {

  if (process.platform === "win32" && process.env.LOCALAPPDATA) {

    return path.join(process.env.LOCALAPPDATA, DESKTOP_PRODUCT_NAME);

  }

  if (process.platform === "darwin" && process.env.HOME) {

    return path.join(

      process.env.HOME,

      "Library",

      "Caches",

      DESKTOP_PRODUCT_NAME,

    );

  }

  const xdgCache = process.env.XDG_CACHE_HOME;

  if (xdgCache) {

    return path.join(xdgCache, DESKTOP_PRODUCT_NAME);

  }

  const home = process.env.HOME;

  if (home) {

    return path.join(home, ".cache", DESKTOP_PRODUCT_NAME);

  }

  return null;

}



export function resolveAppCacheDir(app) {

  const localRoot = resolveLocalVendorRoot();

  if (localRoot) {

    return path.join(localRoot, DESKTOP_CACHE_SUBDIR);

  }

  return path.join(resolveUserDataRoot(app), DESKTOP_CACHE_SUBDIR);

}



export function ensureDesktopPathLayout(app) {

  mkdirSync(resolveAppDataDir(app), { recursive: true });

  mkdirSync(resolveCatalogRoot(app), { recursive: true });

  mkdirSync(resolveAppLogsDir(app), { recursive: true });

  mkdirSync(resolveAppCacheDir(app), { recursive: true });

}



export function applyElectronPathOverridesBeforeReady(app) {
  if (app.isReady()) {
    return;
  }
  pinDesktopUserDataRoot(app);
  try {
    app.setPath("cache", resolveAppCacheDir(app));
    app.setPath("logs", resolveAppLogsDir(app));
  } catch {
    // ignore — setPath may fail if already configured
  }
}

/** Call once at startup before app.ready handlers run. */
export function prepareDesktopPathLayout(app) {
  pinDesktopUserDataRoot(app);
  ensureDesktopPathLayout(app);
  applyElectronPathOverridesBeforeReady(app);
}


