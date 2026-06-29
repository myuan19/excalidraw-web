import {
  APP_NAME,
  toValidURL,
  URL_HASH_KEYS,
  URL_QUERY_KEYS,
} from "@excalidraw/common";
import { loadLibraryFromBlob } from "@excalidraw/excalidraw/data/blob";
import {
  mergeLibraryItems,
  validateLibraryUrl,
} from "@excalidraw/excalidraw/data/library";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { isAddLibraryHash } from "./documentHash";
import {
  normalizeFileHashAfterLibraryImport,
  parseLibraryImportTokensFromHash,
} from "./libraryImportHash";
import { ExcalidrawAdapter } from "./formats/ExcalidrawAdapter";
import { editorRegistry } from "../editors";
import { isDesktopEditorHub } from "../lib/runtimePlatform";
import { readEditorTabsState } from "../shell/editorTabs";
import { CombinedLibraryAdapter } from "./CombinedLibraryAdapter";
import {
  logLibraryUrlImport,
  logLibraryUrlImportError,
} from "./libraryUrlImportDiag";
import { awaitPendingLibrarySync } from "./librarySyncQueue";
import type { ServerFile } from "./ServerSync";

export const LIBRARY_URL_IMPORT_DONE_EVENT = "editorhub:library-url-import-done";
export const LIBRARY_URL_IMPORT_REQUEST_EVENT =
  "editorhub:library-url-import-request";
export const LIBRARY_URL_IMPORT_ACK_EVENT = "editorhub:library-url-import-ack";
export const LIBRARY_URL_IMPORT_DEEP_LINK_EVENT =
  "editorhub:library-url-import-deep-link";

const LIBRARY_RETURN_HASH_KEY = "editorhub-library-return-hash";
const FOREGROUND_IMPORT_WAIT_MS = 5000;

export type LibraryUrlImportTokens = {
  libraryUrl: string;
  idToken: string | null;
};

let stashedLibraryUrlImport: LibraryUrlImportTokens | null = null;
let importInFlight: Promise<void> | null = null;

/** Ephemeral canvas used only while merging a remote `.excalidrawlib` from URL. */
export function createLibraryImportPlaceholderFile(): ServerFile {
  const now = new Date().toISOString();
  return {
    id: "",
    name: "",
    kind: "excalidraw",
    created_at: now,
    updated_at: now,
    data: ExcalidrawAdapter.createEmpty(),
  };
}

export function notifyLibraryUrlImportDone(): void {
  window.dispatchEvent(new CustomEvent(LIBRARY_URL_IMPORT_DONE_EVENT));
}

function rememberLibraryReturnHash(hash: string): void {
  if (!hash || isAddLibraryHash(hash)) {
    return;
  }
  try {
    sessionStorage.setItem(LIBRARY_RETURN_HASH_KEY, hash);
  } catch {
    /* ignore */
  }
}

function consumeLibraryReturnHash(): string | null {
  try {
    const hash = sessionStorage.getItem(LIBRARY_RETURN_HASH_KEY);
    sessionStorage.removeItem(LIBRARY_RETURN_HASH_KEY);
    return hash;
  } catch {
    return null;
  }
}

/**
 * Capture `#addLibrary=` tokens before desktop session restore rewrites the hash.
 */
export function stashLibraryUrlImportFromHash(
  hash = typeof window !== "undefined" ? window.location.hash : "",
): boolean {
  if (!hash || !isAddLibraryHash(hash)) {
    return false;
  }
  const tokens = parseLibraryImportTokensFromHash(hash);
  if (!tokens) {
    return false;
  }
  stashedLibraryUrlImport = tokens;
  logLibraryUrlImport("stash", {
    urlLen: tokens.libraryUrl.length,
    hasToken: !!tokens.idToken,
    hashPreview: hash.slice(0, 120),
  });
  return true;
}

function takeStashedLibraryUrlImport(): LibraryUrlImportTokens | null {
  const tokens = stashedLibraryUrlImport;
  stashedLibraryUrlImport = null;
  return tokens;
}

function resolveLibraryImportTokens(): LibraryUrlImportTokens | null {
  const stashed = takeStashedLibraryUrlImport();
  if (stashed) {
    logLibraryUrlImport("resolveTokens", { source: "stash" });
    return stashed;
  }
  const parsed = parseLibraryImportTokensFromHash(window.location.hash);
  if (parsed) {
    logLibraryUrlImport("resolveTokens", { source: "location" });
  }
  return parsed;
}

function documentUrlToPath(url: string): string {
  const hashIndex = url.indexOf("#");
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : "";
  if (typeof window === "undefined") {
    return hash;
  }
  return `${window.location.pathname}${window.location.search}${hash}`;
}

function restoreDocumentUrl(url: string): void {
  if (typeof window === "undefined" || !url) {
    return;
  }
  const targetPath = documentUrlToPath(url);
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (currentPath === targetPath) {
    logLibraryUrlImport("restoreDocumentUrl.skip", { targetPath });
    return;
  }
  logLibraryUrlImport("restoreDocumentUrl", {
    from: currentPath.slice(0, 120),
    to: targetPath.slice(0, 120),
  });
  window.history.replaceState({}, APP_NAME, targetPath);
}

/**
 * URL passed to libraries.excalidraw.com as `referrer` so install redirects back
 * to the current EditorHub document (including desktop tab state).
 */
export function resolveLibraryReturnUrl(): string {
  if (typeof window === "undefined") {
    return "";
  }
  const base = `${window.location.origin}${window.location.pathname}`;

  if (isDesktopEditorHub()) {
    const state = readEditorTabsState();
    const active = state.tabs.find((tab) => tab.id === state.activeTabId);
    if (active?.type === "file") {
      const hash = editorRegistry.buildFileHash(active.fileId, active.kind);
      rememberLibraryReturnHash(hash);
    }
    return base;
  }

  const hash = window.location.hash;
  if (hash && !isAddLibraryHash(hash)) {
    rememberLibraryReturnHash(hash);
    return `${base}${hash}`;
  }

  return base;
}

export function clearAddLibraryFromLocation(): void {
  if (typeof window === "undefined") {
    return;
  }
  if (window.location.hash.includes(URL_HASH_KEYS.addLibrary)) {
    const normalized = normalizeFileHashAfterLibraryImport(window.location.hash);
    const base = `${window.location.origin}${window.location.pathname}${window.location.search}`;
    window.history.replaceState(
      {},
      APP_NAME,
      normalized ? `${base}${normalized}` : base,
    );
    return;
  }
  if (window.location.search.includes(URL_QUERY_KEYS.addLibrary)) {
    const query = new URLSearchParams(window.location.search);
    query.delete(URL_QUERY_KEYS.addLibrary);
    window.history.replaceState({}, APP_NAME, `?${query.toString()}`);
  }
}

/** Restore the pre-install route in the URL bar without switching tabs or layout. */
export function restoreLocationAfterLibraryImport(): void {
  if (typeof window === "undefined") {
    return;
  }

  const preservedHash = consumeLibraryReturnHash();
  if (preservedHash) {
    const base = `${window.location.origin}${window.location.pathname}${window.location.search}`;
    if (window.location.hash !== preservedHash) {
      window.history.replaceState({}, APP_NAME, `${base}${preservedHash}`);
    }
    return;
  }

  clearAddLibraryFromLocation();
}

async function fetchLibraryBlob(tokens: LibraryUrlImportTokens): Promise<Blob> {
  let libraryUrl = decodeURIComponent(tokens.libraryUrl);
  libraryUrl = toValidURL(libraryUrl);
  logLibraryUrlImport("fetch.start", {
    host: (() => {
      try {
        return new URL(libraryUrl).hostname;
      } catch {
        return null;
      }
    })(),
    urlLen: libraryUrl.length,
  });
  validateLibraryUrl(libraryUrl);

  const response = await fetch(libraryUrl);
  logLibraryUrlImport("fetch.response", {
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get("content-type"),
  });
  if (!response.ok) {
    throw new Error(`Library fetch failed (${response.status})`);
  }
  const blob = await response.blob();
  logLibraryUrlImport("fetch.blob", { size: blob.size, type: blob.type });
  return blob;
}

/**
 * Proven import path: same as Excalidraw `useHandleLibrary` URL import, but silent
 * (no confirm dialog, no sidebar open).
 */
export async function importLibraryTokensViaApi(
  api: ExcalidrawImperativeAPI,
  tokens: LibraryUrlImportTokens,
): Promise<{ addedCount: number }> {
  logLibraryUrlImport("apiImport.start", {
    hasToken: !!tokens.idToken,
  });
  const blob = await fetchLibraryBlob(tokens);
  const before = await api.getLibraryItems();
  const beforeIds = new Set(before.map((item) => item.id));
  logLibraryUrlImport("apiImport.before", { beforeCount: before.length });

  const merged = await api.updateLibrary({
    libraryItems: blob,
    prompt: false,
    merge: true,
    defaultStatus: "published",
    openLibraryMenu: false,
  });

  const addedCount = merged.filter((item) => !beforeIds.has(item.id)).length;
  logLibraryUrlImport(
    "apiImport.done",
    {
      mergedCount: merged.length,
      addedCount,
    },
    "ok",
  );
  return { addedCount };
}

/** Fallback when no foreground Excalidraw API is mounted yet. */
export async function runBackgroundLibraryUrlImport(
  tokens: LibraryUrlImportTokens,
): Promise<{ addedCount: number }> {
  logLibraryUrlImport("backgroundImport.start", {});
  const blob = await fetchLibraryBlob(tokens);
  const imported = await loadLibraryFromBlob(blob, "published");
  const importedPublished = imported.map((item) => ({
    ...item,
    status: "published" as const,
  }));
  logLibraryUrlImport("backgroundImport.parsed", {
    importedCount: importedPublished.length,
  });

  const current = await CombinedLibraryAdapter.load();
  const currentItems = current?.libraryItems ?? [];
  const merged = mergeLibraryItems(currentItems, importedPublished);
  logLibraryUrlImport("backgroundImport.merge", {
    beforeCount: currentItems.length,
    mergedCount: merged.length,
  });
  await CombinedLibraryAdapter.save({ libraryItems: merged });
  await awaitPendingLibrarySync();
  logLibraryUrlImport(
    "backgroundImport.done",
    { addedCount: importedPublished.length },
    "ok",
  );

  return { addedCount: importedPublished.length };
}

function requestForegroundImport(tokens: LibraryUrlImportTokens): Promise<boolean> {
  logLibraryUrlImport("foreground.request", {
    urlLen: tokens.libraryUrl.length,
    waitMs: FOREGROUND_IMPORT_WAIT_MS,
  });
  return new Promise((resolve) => {
    let settled = false;
    const finish = (handled: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      window.removeEventListener(LIBRARY_URL_IMPORT_ACK_EVENT, onAck);
      resolve(handled);
    };
    const onAck = () => {
      logLibraryUrlImport("foreground.ack", {}, "ok");
      finish(true);
    };
    window.addEventListener(LIBRARY_URL_IMPORT_ACK_EVENT, onAck);
    window.setTimeout(() => {
      if (!settled) {
        logLibraryUrlImport("foreground.timeout", {}, "fail");
      }
      finish(false);
    }, FOREGROUND_IMPORT_WAIT_MS);
    window.dispatchEvent(
      new CustomEvent<LibraryUrlImportTokens>(LIBRARY_URL_IMPORT_REQUEST_EVENT, {
        detail: tokens,
      }),
    );
  });
}

async function handleLibraryUrlImport(
  tokens: LibraryUrlImportTokens,
  opts?: { restoreUrl?: string | null },
): Promise<void> {
  if (opts?.restoreUrl) {
    restoreDocumentUrl(opts.restoreUrl);
  }

  if (importInFlight) {
    logLibraryUrlImport("handle.skip", { reason: "import-in-flight" });
    await importInFlight;
    return;
  }

  logLibraryUrlImport("handle.start", {
    hasRestoreUrl: !!opts?.restoreUrl,
    restorePreview: opts?.restoreUrl?.slice(0, 120) ?? null,
    hash: window.location.hash.slice(0, 120),
  });

  importInFlight = (async () => {
    try {
      const handledByForeground = await requestForegroundImport(tokens);
      logLibraryUrlImport("handle.foregroundResult", { handledByForeground });
      if (!handledByForeground) {
        await runBackgroundLibraryUrlImport(tokens);
        notifyLibraryUrlImportDone();
        logLibraryUrlImport("handle.notifyRefresh", {}, "ok");
      }
      restoreLocationAfterLibraryImport();
      logLibraryUrlImport("handle.done", {}, "ok");
    } catch (error) {
      logLibraryUrlImportError("handle.fail", error);
      restoreLocationAfterLibraryImport();
    } finally {
      clearAddLibraryFromLocation();
      importInFlight = null;
    }
  })();

  await importInFlight;
}

/**
 * Global `#addLibrary=` handler: merge into global library in the background,
 * keep current layout, refresh open library panels via LIBRARY_URL_IMPORT_DONE_EVENT.
 */
export function startGlobalLibraryUrlImportListener(): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  stashLibraryUrlImportFromHash();

  logLibraryUrlImport("listener.mount", {
    hash: window.location.hash.slice(0, 120),
  });

  const runFromCurrentLocation = () => {
    const tokens = resolveLibraryImportTokens();
    if (tokens) {
      logLibraryUrlImport("listener.initImport", { source: "boot" }, "start");
      void handleLibraryUrlImport(tokens);
    } else {
      logLibraryUrlImport("listener.initSkip", { reason: "no-tokens" });
    }
  };

  runFromCurrentLocation();

  const onHashChange = (event: HashChangeEvent) => {
    const tokens = parseLibraryImportTokensFromHash(window.location.hash);
    if (!tokens) {
      return;
    }
    logLibraryUrlImport(
      "listener.hashchange",
      {
        oldURL: event.oldURL?.slice(0, 160) ?? null,
        newURL: event.newURL?.slice(0, 160) ?? null,
      },
      "start",
    );
    event.stopImmediatePropagation();
    void handleLibraryUrlImport(tokens, { restoreUrl: event.oldURL || null });
  };

  window.addEventListener("hashchange", onHashChange, true);

  const onDeepLinkImport = (event: Event) => {
    const tokens = (event as CustomEvent<LibraryUrlImportTokens>).detail;
    if (!tokens?.libraryUrl) {
      return;
    }
    logLibraryUrlImport("listener.deepLink", { source: "desktop" }, "start");
    void handleLibraryUrlImport(tokens);
  };
  window.addEventListener(LIBRARY_URL_IMPORT_DEEP_LINK_EVENT, onDeepLinkImport);

  return () => {
    window.removeEventListener("hashchange", onHashChange, true);
    window.removeEventListener(
      LIBRARY_URL_IMPORT_DEEP_LINK_EVENT,
      onDeepLinkImport,
    );
  };
}
