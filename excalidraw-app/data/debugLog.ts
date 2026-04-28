/**
 * Opt-in debug logging for excalidraw-web. Set in devtools console:
 *   localStorage.setItem("excalidraw-web-debug", "1")
 * Then reload. Remove with removeItem or set to "0".
 *
 * Client→server diagnostics are on by default (see data/clientRemoteLog.ts). To stop sending:
 *   localStorage.setItem("excalidraw-web-remote-log", "0")
 * Server ingest defaults on; disable with EXCALIDRAW_CLIENT_LOG=0. Logs: EXCALIDRAW_DATA_DIR/logs/client.log.
 * Docker: EXCALIDRAW_HTTP_TRACE=1 → every API response line with ms + UA;
 * EXCALIDRAW_API_DEBUG=1 → extra server scene/meta logs.
 *
 * FileList card click / open / drag (verbose, for diagnosing “cannot open”):
 *   localStorage.setItem("excalidraw-web-debug-filelist-open", "1")
 * (Also active when `excalidraw-web-debug` is "1".)
 * Disable: set to "0" or removeItem.
 *
 * 文件列表缩略图整链（thumbFetchAllow→SKIP 原因→GET→setState）：`debugLog.thumbPipeline`
 */
/* eslint-disable no-console -- intentional debug logger */
import { enqueueRemoteLog, isRemoteLogEnabled } from "./clientRemoteLog";

const P = "[excalidraw-web]";

function isFileListOpenTraceEnabled(): boolean {
  try {
    if (localStorage.getItem("excalidraw-web-debug-filelist-open") === "0") {
      return false;
    }
    if (localStorage.getItem("excalidraw-web-debug") === "1") {
      return true;
    }
    return localStorage.getItem("excalidraw-web-debug-filelist-open") === "1";
  } catch {
    return false;
  }
}

function isEnabled(): boolean {
  try {
    if (import.meta.env.DEV) {
      return true;
    }
    return (
      typeof localStorage !== "undefined" &&
      localStorage.getItem("excalidraw-web-debug") === "1"
    );
  } catch {
    return false;
  }
}

function ts() {
  return new Date().toISOString();
}

function log(channel: string, msg: string, ...args: unknown[]) {
  const toConsole = isEnabled();
  const toRemote = isRemoteLogEnabled();
  if (!toConsole && !toRemote) {
    return;
  }
  if (toConsole) {
    console.log(P, ts(), channel, msg, ...args);
  }
  if (toRemote) {
    enqueueRemoteLog({ channel, message: msg, args });
  }
}

export const debugLog = {
  scene(msg: string, ...args: unknown[]) {
    log("[scene]", msg, ...args);
  },
  save(msg: string, ...args: unknown[]) {
    log("[save]", msg, ...args);
  },
  thumbnail(msg: string, ...args: unknown[]) {
    log("[thumbnail]", msg, ...args);
  },
  sync(msg: string, ...args: unknown[]) {
    log("[sync]", msg, ...args);
  },
  fileList(msg: string, ...args: unknown[]) {
    log("[fileList]", msg, ...args);
  },
  /** Click-to-open, pointer, long-press, drag — see isFileListOpenTraceEnabled. */
  fileListOpen(msg: string, ...args: unknown[]) {
    if (!isFileListOpenTraceEnabled()) {
      return;
    }
    log("[fileList·open]", msg, ...args);
  },
  init(msg: string, ...args: unknown[]) {
    log("[init]", msg, ...args);
  },
  stash(msg: string, ...args: unknown[]) {
    log("[stash]", msg, ...args);
  },
  hash(msg: string, ...args: unknown[]) {
    log("[hash]", msg, ...args);
  },
  library(msg: string, ...args: unknown[]) {
    log("[library]", msg, ...args);
  },
  diag(msg: string, ...args: unknown[]) {
    log("[diag]", msg, ...args);
  },
  /** 列表缩略图：允许集→跳过原因聚合→每张卡 GET→正文长度（默认进远端 client.log） */
  thumbPipeline(msg: string, ...args: unknown[]) {
    log("[thumbPipeline]", msg, ...args);
  },
};
