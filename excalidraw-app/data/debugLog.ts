/**
 * Opt-in debug logging for excalidraw-web. Set in devtools console:
 *   localStorage.setItem("excalidraw-web-debug", "1")
 * Then reload. Remove with removeItem or set to "0".
 */
/* eslint-disable no-console -- intentional debug logger */
const P = "[excalidraw-web]";

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
  if (!isEnabled()) {
    return;
  }
  console.log(P, ts(), channel, msg, ...args);
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
};
