/**
 * Central development diagnostics for the host app (MindMap shell, file list, embed).
 * Vite dev: common channels on; noisy render/thumbnail channels are opt-in.
 * Production bundle: off unless debug-ship build (VITE_APP_DEPLOY_DEBUG) or per-channel VITE_APP_ENABLE_*_DEBUG.
 */

import { createLogger } from "./logger";
import { isDebugRuntimeEnabled } from "../data/debugCapability";

export type DevDebugChannel =
  | "app"
  | "editor-bridge"
  | "editor-open"
  | "mindmap-open"
  | "mindmap-bridge"
  | "mindmap-persist"
  | "mindmap-thumbnail"
  | "ai-config"
  | "embed"
  | "file-list"
  | "thumbnail-pipeline";

const channelLoggers = new Map<DevDebugChannel, ReturnType<typeof createLogger>>();

export function isDevDebugChannelEnabled(channel: DevDebugChannel): boolean {
  if (!isDebugRuntimeEnabled()) {
    return false;
  }
  return true;
}

function loggerForChannel(channel: DevDebugChannel): ReturnType<typeof createLogger> {
  let logger = channelLoggers.get(channel);
  if (!logger) {
    logger = createLogger({
      module: `dev.${channel}`,
      minLevel: "debug",
    });
    channelLoggers.set(channel, logger);
  }
  return logger;
}

function labelToEvent(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 80);
  return slug || "event";
}

export function devDebug(
  channel: DevDebugChannel,
  label: string,
  data?: Record<string, unknown>,
): void {
  if (!isDevDebugChannelEnabled(channel)) {
    return;
  }
  loggerForChannel(channel).event(
    "debug",
    `dev.${channel}.${labelToEvent(label)}`,
    label,
    {
      fields: {
        channel,
        ...(data ?? {}),
      },
    },
  );
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
