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
  try {
    return hashString(JSON.stringify(stableNormalize(toSceneHashPayload(data))));
  } catch {
    return hashString(JSON.stringify(data));
  }
}

/**
 * Stable fingerprint for any managed document payload.
 *
 * Legacy Excalidraw scene payloads keep the existing scene hash semantics.
 * Managed Excalidraw documents still ignore `data.appState.name`, while other
 * document kinds hash the whole stable-normalized document shell and payload.
 */
export function hashDocumentSnapshot(data: unknown): string {
  if (!data || typeof data !== "object") {
    return "0";
  }
  try {
    return hashString(JSON.stringify(stableNormalize(toDocumentHashPayload(data))));
  } catch {
    return hashString(JSON.stringify(data));
  }
}

function toSceneHashPayload(data: ForkSceneSnapshot | unknown): {
  elements: unknown;
  appState: unknown;
  files: unknown;
} {
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

  return { elements: o.elements, appState, files: o.files ?? {} };
}

function isManagedDocument(value: unknown): value is {
  kind: string;
  data?: unknown;
  [key: string]: unknown;
} {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { kind?: unknown }).kind === "string" &&
    "data" in value
  );
}

function isExcalidrawLikeScene(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    ((value as { type?: unknown }).type === "excalidraw" ||
      "elements" in value ||
      "appState" in value ||
      "files" in value)
  );
}

function toDocumentHashPayload(data: unknown): unknown {
  if (isManagedDocument(data)) {
    if (data.kind === "excalidraw") {
      return {
        ...data,
        data: toSceneHashPayload(data.data),
      };
    }
    return data;
  }

  if (isExcalidrawLikeScene(data)) {
    return toSceneHashPayload(data);
  }

  return data;
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
