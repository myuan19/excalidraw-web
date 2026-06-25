/**
 * Central development diagnostics for the host app (MindMap shell, file list, embed).
 * EDITORHUB_DESKTOP_DEBUG / 设置内调试日志开启后：全部通道 + IPC/协议 → desktop-op.log。
 * 未开调试时：Vite dev 全开；生产仅 VITE_APP_DEPLOY_DEBUG 或 per-channel VITE_APP_ENABLE_*_DEBUG。
 */

import { isDebugRuntimeEnabled } from "../data/debugCapability";

import { createLogger } from "./logger";
import { isDesktopEditorHub } from "./runtimePlatform";

export type DevDebugChannel =
  | "app"
  | "api-sync"
  | "editor-bridge"
  | "editor-open"
  | "mindmap-open"
  | "mindmap-bridge"
  | "mindmap-op"
  | "mindmap-persist"
  | "mindmap-thumbnail"
  | "ai-config"
  | "embed"
  | "file-list"
  | "shell-nav"
  | "thumbnail-pipeline"
  | "user-trace";

const CHANNEL_ENV_FLAG: Record<DevDebugChannel, string> = {
  app: "VITE_APP_ENABLE_APP_DEBUG",
  "api-sync": "VITE_APP_ENABLE_API_SYNC_DEBUG",
  "editor-bridge": "VITE_APP_ENABLE_EDITOR_BRIDGE_DEBUG",
  "editor-open": "VITE_APP_ENABLE_EDITOR_OPEN_DEBUG",
  "mindmap-open": "VITE_APP_ENABLE_MINDMAP_DEBUG",
  "mindmap-bridge": "VITE_APP_ENABLE_MINDMAP_DEBUG",
  "mindmap-op": "VITE_APP_ENABLE_MINDMAP_DEBUG",
  "mindmap-persist": "VITE_APP_ENABLE_MINDMAP_DEBUG",
  "mindmap-thumbnail": "VITE_APP_ENABLE_MINDMAP_THUMBNAIL_DEBUG",
  "ai-config": "VITE_APP_ENABLE_AI_CONFIG_DEBUG",
  embed: "VITE_APP_ENABLE_EMBED_DEBUG",
  "file-list": "VITE_APP_ENABLE_FILE_LIST_DEBUG",
  "shell-nav": "VITE_APP_ENABLE_SHELL_NAV_DEBUG",
  "thumbnail-pipeline": "VITE_APP_ENABLE_THUMBNAIL_DEBUG",
  "user-trace": "VITE_APP_ENABLE_USER_TRACE_DEBUG",
};

function isDeployDebugBuild(): boolean {
  return import.meta.env.VITE_APP_DEPLOY_DEBUG === "true";
}

export function isDevDebugChannelEnabled(channel: DevDebugChannel): boolean {
  if (isDebugRuntimeEnabled()) {
    return true;
  }
  if (isDeployDebugBuild()) {
    return true;
  }
  if (import.meta.env.DEV) {
    return true;
  }
  const flag = CHANNEL_ENV_FLAG[channel];
  return import.meta.env[flag] === "true";
}

export function isFileListLayoutDebugEnabled(): boolean {
  return isDevDebugChannelEnabled("file-list");
}

export function isFileListThumbnailDebugEnabled(): boolean {
  return isDevDebugChannelEnabled("file-list");
}

export function isTitlebarTabsLayoutDebugEnabled(): boolean {
  return isDevDebugChannelEnabled("app");
}

export function isFileListFolderDndDebugEnabled(): boolean {
  return isDevDebugChannelEnabled("file-list");
}

let desktopDebugLog: ReturnType<typeof createLogger> | null = null;

function getDesktopDebugLog() {
  if (!desktopDebugLog) {
    desktopDebugLog = createLogger({ module: "devDebug" });
  }
  return desktopDebugLog;
}

function formatDevDebugConsoleData(
  data: Record<string, unknown>,
): string | undefined {
  try {
    return JSON.stringify(data);
  } catch {
    return undefined;
  }
}

function isDesktopEditorHubLocal(): boolean {
  return isDesktopEditorHub();
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

  if (isDesktopEditorHubLocal()) {
    getDesktopDebugLog().debug(label, { channel, ...(data ?? {}) });
    if (data === undefined) {
      console.warn(prefix);
      return;
    }
    const serialized = formatDevDebugConsoleData(data);
    console.warn(prefix, serialized ?? "");
    return;
  }

  // eslint-disable-next-line no-console -- devDebug intentionally mirrors to DevTools.
  const write = console.log;
  if (data === undefined) {
    write(prefix);
    return;
  }
  try {
    write(prefix, data);
  } catch {
    write(prefix);
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

/** @deprecated Use isDevDebugChannelEnabled("ai-config") */
export function isAIConfigDebugEnabled(): boolean {
  return isDevDebugChannelEnabled("ai-config");
}
