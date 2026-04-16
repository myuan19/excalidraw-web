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
    const s = JSON.stringify(stableNormalize(payload));
    return hashString(s);
  } catch {
    return hashString(JSON.stringify(data));
  }
}

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableNormalize(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));

  const normalized: Record<string, unknown> = {};
  for (const [key, entryValue] of entries) {
    normalized[key] = stableNormalize(entryValue);
  }
  return normalized;
}

function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h, 33) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}
