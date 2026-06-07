/**
 * Central development diagnostics for the host app (MindMap shell, file list, embed).
 * Vite dev: common channels on; noisy render/thumbnail channels are opt-in.
 * Production bundle: off unless debug-ship build (VITE_APP_DEPLOY_DEBUG) or per-channel VITE_APP_ENABLE_*_DEBUG.
 */

export type DevDebugChannel =
  | "app"
  | "editor-bridge"
  | "editor-open"
  | "mindmap-open"
  | "mindmap-bridge"
  | "mindmap-thumbnail"
  | "ai-config"
  | "embed"
  | "file-list"
  | "thumbnail-pipeline";

const CHANNEL_ENV_FLAG: Record<DevDebugChannel, string> = {
  app: "VITE_APP_ENABLE_APP_DEBUG",
  "editor-bridge": "VITE_APP_ENABLE_EDITOR_BRIDGE_DEBUG",
  "editor-open": "VITE_APP_ENABLE_EDITOR_OPEN_DEBUG",
  "mindmap-open": "VITE_APP_ENABLE_MINDMAP_DEBUG",
  "mindmap-bridge": "VITE_APP_ENABLE_MINDMAP_DEBUG",
  "mindmap-thumbnail": "VITE_APP_ENABLE_MINDMAP_DEBUG",
  "ai-config": "VITE_APP_ENABLE_AI_CONFIG_DEBUG",
  embed: "VITE_APP_ENABLE_EMBED_DEBUG",
  "file-list": "VITE_APP_ENABLE_FILE_LIST_DEBUG",
  "thumbnail-pipeline": "VITE_APP_ENABLE_THUMBNAIL_DEBUG",
};

const NOISY_DEV_CHANNELS = new Set<DevDebugChannel>([
  "file-list",
  "mindmap-thumbnail",
  "thumbnail-pipeline",
]);

function isDeployDebugBuild(): boolean {
  return import.meta.env.VITE_APP_DEPLOY_DEBUG === "true";
}

function isLocalStorageDebugEnabled(channel: DevDebugChannel): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return (
      window.localStorage.getItem("excalidraw-web-debug") === "1" ||
      window.localStorage.getItem(`excalidraw-web-debug-${channel}`) === "1"
    );
  } catch {
    return false;
  }
}

export function isDevDebugChannelEnabled(channel: DevDebugChannel): boolean {
  const flag = CHANNEL_ENV_FLAG[channel];
  if (import.meta.env.PROD) {
    if (isDeployDebugBuild()) {
      return true;
    }
    return import.meta.env[flag] === "true" || isLocalStorageDebugEnabled(channel);
  }
  if (NOISY_DEV_CHANNELS.has(channel)) {
    return import.meta.env[flag] === "true" || isLocalStorageDebugEnabled(channel);
  }
  return true;
}

export function devDebug(
  channel: DevDebugChannel,
  label: string,
  data?: Record<string, unknown>,
): void {
  if (!isDevDebugChannelEnabled(channel)) {
    return;
  }
  const prefix = `[DEBUG] ${channel} | ${label}`;
  if (data === undefined) {
    console.log(prefix);
    return;
  }
  try {
    console.log(prefix, data);
  } catch {
    console.log(prefix);
  }
}

/** @deprecated Use isDevDebugChannelEnabled("embed") */
export function isEmbedDebugEnabled(): boolean {
  return isDevDebugChannelEnabled("embed");
}

/** @deprecated Use isDevDebugChannelEnabled("mindmap-open") */
export function isMindMapOpenDebugEnabled(): boolean {
  return isDevDebugChannelEnabled("mindmap-open");
}

/** @deprecated Use isDevDebugChannelEnabled("app") */
export function isAppDebugEnabled(): boolean {
  return isDevDebugChannelEnabled("app");
}

/** Sidebar folder drag + POST /files/order (localStorage opt-in in production). */
export function isFileListFolderDndDebugEnabled(): boolean {
  if (isDevDebugChannelEnabled("file-list")) {
    return true;
  }
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return localStorage.getItem("excalidraw-filelist-folder-dnd-debug") === "1";
  } catch {
    return false;
  }
}

/** @deprecated Use isDevDebugChannelEnabled("ai-config") */
export function isAIConfigDebugEnabled(): boolean {
  return isDevDebugChannelEnabled("ai-config");
}
