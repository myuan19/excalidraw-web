import type { ForkSceneSnapshot } from "./forkFileTypes";

/**
 * Stable fingerprint for scene content.
 *
 * Strips `appState.name` before hashing so that file-name changes (managed by
 * the server `files` table, not the canvas) never cause a hash mismatch.
 *
 * Uses plain `JSON.stringify` with sorted keys for determinism — avoids a
 * static import of `@excalidraw/excalidraw` which would pull the entire editor
 * into the initial bundle.
 */
export function hashSceneSnapshot(data: ForkSceneSnapshot | unknown): string {
  if (!data || typeof data !== "object") {
    return "0";
  }
  const o = data as {
    elements?: unknown;
    appState?: unknown;
    files?: unknown;
  };
  let appState = o.appState;
  if (appState && typeof appState === "object" && "name" in appState) {
    const { name: _stripped, ...rest } = appState as Record<string, unknown>;
    appState = rest;
  }
  try {
    const payload = { elements: o.elements, appState, files: o.files ?? {} };
    const s = JSON.stringify(payload, Object.keys(payload).sort());
    return hashString(s);
  } catch {
    return hashString(JSON.stringify(data));
  }
}

function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h, 33) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}
