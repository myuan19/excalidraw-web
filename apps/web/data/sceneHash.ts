import type { ForkSceneSnapshot } from "./forkFileTypes";

/**
 * Content-identity authority for documents.
 *
 * Every "is this modified?" decision funnels through {@link hashSceneSnapshot} /
 * {@link hashDocumentSnapshot}: the live editor (`EditorShell.handleChange`), the
 * load/baseline paths (`initializeExcalidrawScene`, `loadEditorServerFile`),
 * saves, remote/cross-tab apply, the draft cache and the thumbnail pipeline all
 * establish or compare baselines via these fingerprints. Those producers hand us
 * RAW scenes — the baseline paths in particular hash the server/cache payload
 * with its appState untouched — so this module is the single place that can
 * define what counts as document content.
 *
 * It is therefore the authority, not a fallback: stripping transient appState
 * here (see {@link CONTENT_APP_STATE_KEYS}) is what keeps a freshly-loaded
 * baseline and a live edit in agreement no matter which entry point produced
 * them. Cleaning at any one producer (e.g. the editor's capture boundary) only
 * governs what gets *persisted*; it cannot guarantee identity across producers.
 *
 * Determinism: plain `JSON.stringify` over sorted keys. We deliberately avoid a
 * static import of `@excalidraw/excalidraw` so this module — loaded with the
 * initial file-list bundle — never drags in the editor. The key projection below
 * is instead kept in lock-step with Excalidraw by a contract test
 * (`sceneHash.contract.test.ts`).
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
 * Legacy Excalidraw scene payloads ignore UI-only appState, and managed
 * MindMap documents ignore `data.view` because viewport position is local UI
 * state rather than document content.
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

/**
 * The appState Excalidraw persists as document content — the `export`/`server`
 * projection of its `APP_STATE_STORAGE_CONF` (both views coincide on these
 * keys). Everything else — `openMenu`, `openPopup`, `openSidebar`, selection,
 * scroll/zoom, `activeTool` and the other current-item UI defaults — is
 * transient UI state that must NOT affect document identity; otherwise merely
 * opening the hamburger menu or selecting an element would flag the file as
 * modified.
 *
 * This is a local copy (the module stays free of the editor bundle — see file
 * header). `sceneHash.contract.test.ts` asserts it stays identical to
 * `cleanAppStateForExport`/`clearAppStateForDatabase` over `getDefaultAppState()`,
 * so an upstream change to the persisted set fails the test instead of silently
 * degrading dirty detection.
 */
export const CONTENT_APP_STATE_KEYS = [
  "viewBackgroundColor",
  "gridSize",
  "gridStep",
  "gridModeEnabled",
  "lockedMultiSelections",
] as const;

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

  const contentAppState: Record<string, unknown> = {};
  if (o.appState && typeof o.appState === "object") {
    const source = o.appState as Record<string, unknown>;
    for (const key of CONTENT_APP_STATE_KEYS) {
      if (source[key] !== undefined) {
        contentAppState[key] = source[key];
      }
    }
  }

  return {
    elements: o.elements,
    appState: contentAppState,
    files: o.files ?? {},
  };
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
    if (
      data.kind === "mindmap" &&
      data.data &&
      typeof data.data === "object" &&
      !Array.isArray(data.data)
    ) {
      const { view: _ignoredView, ...contentData } = data.data as Record<
        string,
        unknown
      >;
      return {
        ...data,
        data: contentData,
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
