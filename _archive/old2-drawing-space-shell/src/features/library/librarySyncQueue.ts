import { ServerSync } from "@/services/ServerSync";
import type { LibrarySyncPayload } from "@/types/file";
import { emitAppNotice } from "@/features/ui/appNotice";

const MIRROR_KEY = "drawing-space-library-mirror";
const SYNC_DEBOUNCE_MS = 400;

let timer: number | null = null;
let pendingPayload: LibrarySyncPayload | null = null;
let inFlight = false;

export function writeLibraryMirror(data: unknown) {
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify(data));
  } catch {
    // Library mirror is best-effort and should not block editing.
  }
}

export function readLibraryMirror<T = unknown>(): T | null {
  try {
    const raw = localStorage.getItem(MIRROR_KEY);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

async function flushNow() {
  if (inFlight || !pendingPayload) return;
  const payload = pendingPayload;
  pendingPayload = null;
  inFlight = true;
  try {
    await ServerSync.syncLibrary(payload);
  } catch (error) {
    pendingPayload = payload;
    emitAppNotice({
      level: "warning",
      key: "library-sync-failed",
      message: error instanceof Error
        ? `素材库同步失败，将稍后重试：${error.message}`
        : "素材库同步失败，将稍后重试。",
    });
  } finally {
    inFlight = false;
  }
}

export async function queueLibrarySync(mirrorData: unknown, payload: LibrarySyncPayload): Promise<void> {
  writeLibraryMirror(mirrorData);
  pendingPayload = payload;
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    void flushNow();
  }, SYNC_DEBOUNCE_MS);
}

export function flushPendingLibrarySync() {
  if (timer) {
    window.clearTimeout(timer);
    timer = null;
  }
  void flushNow();
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushPendingLibrarySync);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingLibrarySync();
  });
}
