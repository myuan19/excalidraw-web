/**
 * Local-first library mirror + debounced POST /api/library/sync.
 * JSON.stringify runs in requestIdleCallback (with timeout) before sync.
 *
 * Large embedded binaries in library `elements` still travel in JSON; a future
 * improvement is blob upload via /api/files with refs only — see plan.
 */

import { set } from "idb-keyval";

import { createLogger } from "../lib/logger";

import { apiTransport } from "./apiTransport";

const logLibrary = createLogger({ module: "library" });

export const LIBRARY_IDB_KEY = "excalidraw-web-library-mirror";
const SYNC_DEBOUNCE_MS = 400;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSyncBody: object | null = null;
let inFlight = false;

function stringifyInIdle(body: object, then: (json: string) => void): void {
  const run = () => {
    try {
      then(JSON.stringify(body));
    } catch {
      then("{}");
    }
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 2000 });
  } else {
    queueMicrotask(run);
  }
}

async function postSyncJson(json: string): Promise<void> {
  logLibrary.debug("POST /api/library/sync sending", {
    bytes: json.length,
  });

  const res = await apiTransport.request({
    method: "POST",
    path: "/api/library/sync",
    headers: { "Content-Type": "application/json" },
    body: json,
  });

  const ct = res.headers["content-type"] || res.headers["Content-Type"] || "";
  if (res.status < 200 || res.status >= 300 || !ct.includes("application/json")) {
    const errText = res.bodyText || "";
    console.error("[lib-sync] POST failed", res.status, errText);
    throw new Error(`Library sync ${res.status}`);
  }
  let result: unknown = {};
  try {
    result = JSON.parse(res.bodyText);
  } catch {
    result = {};
  }
  logLibrary.debug("POST success", { result });
}

function syncNow(): void {
  if (inFlight) {
    setTimeout(() => syncNow(), 50);
    return;
  }
  if (!pendingSyncBody) {
    return;
  }
  const body = pendingSyncBody;
  pendingSyncBody = null;
  inFlight = true;
  stringifyInIdle(body, (json) => {
    void postSyncJson(json)
      .catch(() => {
        pendingSyncBody = body;
      })
      .finally(() => {
        inFlight = false;
        if (pendingSyncBody) {
          syncNow();
        }
      });
  });
}

function scheduleDebouncedSync(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    syncNow();
  }, SYNC_DEBOUNCE_MS);
}

export async function queueLibrarySync(
  mirrorData: unknown,
  syncBody: object,
): Promise<void> {
  logLibrary.debug("queueLibrarySync called", { syncBody });
  try {
    await set(LIBRARY_IDB_KEY, JSON.stringify(mirrorData));
  } catch {
    // quota / private mode
  }
  pendingSyncBody = syncBody;
  scheduleDebouncedSync();
}

export function flushPendingLibrarySync(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (!pendingSyncBody) {
    return;
  }
  const body = pendingSyncBody;
  let json: string;
  try {
    json = JSON.stringify(body);
  } catch {
    return;
  }
  pendingSyncBody = null;
  try {
    void apiTransport
      .request({
        method: "POST",
        path: "/api/library/sync",
        headers: { "Content-Type": "application/json" },
        body: json,
      })
      .catch(() => {});
  } catch {
    // ignore
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => flushPendingLibrarySync());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushPendingLibrarySync();
    }
  });
}
