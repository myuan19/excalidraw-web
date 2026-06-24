/**
 * Handles synchronization between the browser and the local server API.
 */

import { createLogger } from "../lib/logger";
import { devDebug, isFileListFolderDndDebugEnabled } from "../lib/devDebug";

import { editorRegistry } from "../editors/registry";

import { FileSyncState } from "./FileSyncState";
import { getDocumentFormatAdapter } from "./formats/registry";

import { hashDocumentSnapshot } from "./sceneHash";

import {
  buildClientRequestHeaders,
  getClientTabId,
} from "./clientRequestContext";
import { normalizeDocument } from "./documentTypes";
import {
  getDocumentSessionVersion,
  setDocumentSessionVersion,
} from "./documentSessionVersion";
import {
  applyServerFileSessionVersion,
  reconcileSessionVersionFromHashList,
  supplementSessionVersionIfMissing,
  updateLocalCacheServerVersionMeta,
} from "./documentSessionVersionSync";
import { logDocumentVersion } from "./documentVersionLog";

import type { CheckpointPolicy } from "./checkpointPolicy";

import type { ForkSceneSnapshot } from "./forkFileTypes";

const logSync = createLogger({ module: "sync" });
const logSave = createLogger({ module: "save" });
const logHash = createLogger({ module: "hash" });

function logSyncEvent(
  level: "debug" | "info" | "warn",
  event: string,
  message: string,
  fields?: Record<string, unknown>,
): void {
  logSync.event(level, `sync.${event}`, message, { fields });
}

function logSaveEvent(
  level: "debug" | "info" | "warn",
  event: string,
  message: string,
  fields?: Record<string, unknown>,
): void {
  logSave.event(level, `save.file.${event}`, message, { fields });
}

function logHashEvent(
  level: "debug" | "info" | "warn",
  event: string,
  message: string,
  fields?: Record<string, unknown>,
): void {
  logHash.event(level, `hash.${event}`, message, { fields });
}

function url(path: string): string {
  return `/api${path}`;
}

function formatIfNoneMatchHeader(sha256: string): string {
  const trimmed = sha256.trim();
  return trimmed.startsWith('"') ? trimmed : `"${trimmed}"`;
}

const saveLocks = new Map<string, Promise<void>>();
let saveLockSeq = 0;

async function withFileSaveLock<T>(
  fileId: string,
  source: string | null | undefined,
  run: () => Promise<T>,
): Promise<T> {
  const previous = saveLocks.get(fileId) ?? Promise.resolve();
  const lockId = ++saveLockSeq;
  const queuedAt = Date.now();
  const hadPrevious = saveLocks.has(fileId);
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.catch(() => undefined).then(() => current);
  saveLocks.set(fileId, chained);
  logSaveEvent("info", "lock.queued", "file lock queued", {
    clientTabId: getClientTabId(),
    lockId,
    fileId8: fileId.slice(0, 8),
    source: source ?? null,
    hadPrevious,
  });
  await previous.catch(() => undefined);
  try {
    logSaveEvent("info", "lock.acquired", "file lock acquired", {
      clientTabId: getClientTabId(),
      lockId,
      fileId8: fileId.slice(0, 8),
      source: source ?? null,
      waitMs: Date.now() - queuedAt,
    });
    return await run();
  } finally {
    release();
    if (saveLocks.get(fileId) === chained) {
      saveLocks.delete(fileId);
    }
    logSaveEvent("info", "lock.released", "file lock released", {
      clientTabId: getClientTabId(),
      lockId,
      fileId8: fileId.slice(0, 8),
      source: source ?? null,
      heldMs: Date.now() - queuedAt,
      stillQueued: saveLocks.has(fileId),
    });
  }
}

export class ServerSyncError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string,
    public readonly body: string,
  ) {
    super(message);
    this.name = "ServerSyncError";
  }
}

export function isServerSyncNotFoundError(error: unknown): boolean {
  return error instanceof ServerSyncError && error.status === 404;
}

export function isServerSyncVersionConflictError(error: unknown): boolean {
  return error instanceof ServerSyncError && error.status === 409;
}

export function getServerSyncErrorJson(error: unknown): unknown {
  if (!(error instanceof ServerSyncError)) {
    return null;
  }
  try {
    return JSON.parse(error.body);
  } catch {
    return null;
  }
}

function rebuildServerFileFromLocalCache(
  fileId: string,
  contentSha256: string | null,
): ServerFile | null {
  const local = FileSyncState.getLocalCache(fileId);
  if (!local) {
    return null;
  }
  const cachedServerSha = local.meta?.serverContentSha256 ?? null;
  if (contentSha256 && cachedServerSha !== contentSha256) {
    logSyncEvent("warn", "get_file.cache_meta_mismatch", "getFile 304 cache meta mismatch; refetching", {
      id: fileId.slice(0, 8),
      expectedSha8: contentSha256.slice(0, 8),
      cachedSha8: cachedServerSha?.slice(0, 8) ?? null,
    });
    return null;
  }
  const doc = (local as { document?: { kind?: string; name?: string } })
    .document;
  if (doc?.kind === "mindmap") {
    return {
      id: fileId,
      name: doc.name ?? "",
      kind: "mindmap",
      created_at: "",
      updated_at: "",
      content_sha256: cachedServerSha,
      version: local.meta?.serverVersion,
      data: doc,
    };
  }
  if (Array.isArray(local.elements)) {
    return {
      id: fileId,
      name: "",
      kind: "excalidraw",
      created_at: "",
      updated_at: "",
      content_sha256: cachedServerSha,
      version: local.meta?.serverVersion,
      data: {
        elements: local.elements,
        appState: local.appState ?? {},
        files: local.files ?? {},
      },
    };
  }
  return null;
}

async function api<T = unknown>(
  path: string,
  opts: RequestInit = {},
  debugSource?: string,
): Promise<T> {
  const method = opts.method || "GET";
  const t0 =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const elapsedMs = () =>
    Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) -
        t0,
    );
  const folderApiDebug =
    isFileListFolderDndDebugEnabled() &&
    (path.includes("/files/order") || path.includes("/files/folders"));
  logSyncEvent("debug", "api.request", "api request", { path, method });
  if (folderApiDebug) {
    devDebug("file-list", `folder-api request ${method}`, {
      path,
      bodyLen:
        typeof opts.body === "string" ? opts.body.length : opts.body ? 1 : 0,
    });
  }
  const res = await fetch(url(path), {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...buildClientRequestHeaders(debugSource),
      ...(opts.headers ?? {}),
    },
  });
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const text = await res.text();
    if (folderApiDebug) {
      devDebug("file-list", `folder-api non-JSON ${res.status}`, {
        path,
        method,
        contentType: ct || null,
        elapsedMs: elapsedMs(),
        preview: text.slice(0, 240),
        looksLikeHtml:
          text.trimStart().startsWith("<!DOCTYPE") ||
          text.trimStart().startsWith("<html"),
      });
    }
    const looksLikeHtml =
      text.trimStart().startsWith("<!DOCTYPE") ||
      text.trimStart().startsWith("<html");
    const hint = looksLikeHtml
      ? import.meta.env.DEV
        ? " Got HTML instead of JSON — the Vite dev server is serving the SPA for /api (API not reached). Run ./_scripts/dev.sh --all so Express runs on :3033 with proxy, or start server/index.js and set VITE_DEV_API_PROXY_TARGET in .env.development, then restart Vite."
        : " Got HTML instead of JSON — /api is not hitting the Node API (nginx error page or SPA fallback). With Docker: rebuild/restart the image, then docker logs <container> and confirm Node listens (e.g. missing server/logger.js in image leaves nginx up without API)."
      : "";
    logSyncEvent("debug", "api.non_json", "api non-JSON response", {
      path,
      method,
      status: res.status,
      elapsedMs: elapsedMs(),
      preview: text.slice(0, 120),
    });
    throw new Error(
      `API ${path} expected JSON but got ${ct || "unknown type"}.${hint}`,
    );
  }
  if (!res.ok) {
    const text = await res.text();
    logSyncEvent("debug", "api.error", "api error response", {
      path,
      method,
      status: res.status,
      elapsedMs: elapsedMs(),
      preview: text.slice(0, 200),
    });
    if (folderApiDebug) {
      devDebug("file-list", `folder-api error ${res.status}`, {
        path,
        method,
        elapsedMs: elapsedMs(),
        preview: text.slice(0, 240),
      });
    }
    throw new ServerSyncError(
      `API ${res.status}: ${text}`,
      res.status,
      path,
      text,
    );
  }
  const data = (await res.json()) as T;
  logSyncEvent("debug", "api.ok", "api ok", {
    path,
    method,
    elapsedMs: elapsedMs(),
  });
  if (folderApiDebug) {
    devDebug("file-list", `folder-api ok ${res.status}`, {
      path,
      method,
      elapsedMs: elapsedMs(),
    });
  }
  if (method === "PUT" && path.includes("/files/")) {
    logSyncEvent("debug", "api.put_ok", "api PUT ok", { path, data });
  }
  return data;
}

async function parseGetFileResponse(
  id: string,
  res: Response,
): Promise<ServerFile> {
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    throw new Error(
      `API /files/${id} expected JSON but got ${ct || "unknown type"}.`,
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new ServerSyncError(
      `API ${res.status}: ${text}`,
      res.status,
      `/files/${id}`,
      text,
    );
  }
  const file = (await res.json()) as ServerFile;
  const etag = res.headers.get("etag")?.replace(/^"|"$/g, "");
  const sha = file.content_sha256 ?? etag;
  if (sha) {
    FileSyncState.setServerHash(id, sha);
  }
  if (typeof file.version === "number") {
    applyServerFileSessionVersion(id, file.version, "getFile");
  }
  return file;
}

// ---- File CRUD ----

export interface ServerFile {
  id: string;
  name: string;
  kind?: string;
  created_at: string;
  updated_at: string;
  folder_id?: string | null;
  sort_index?: number;
  archive_count?: number;
  /** 服务器磁盘上有 thumbnail.svg（用 /api/files/:id/thumbnail 展示） */
  has_thumbnail?: boolean;
  /** SHA-256 of saved scene JSON on server (thumbnail.meta.json), when present */
  content_sha256?: string | null;
  /** Monotonic document content version maintained by the server. */
  version?: number;
  /** 服务端场景 JSON，与 {@link ForkSceneSnapshot} 一致 */
  data?: ForkSceneSnapshot | unknown;
}

export interface ArchiveEntry {
  id: string;
  label: string;
  created_at: string;
  /** 服务端 SHA-256（场景 JSON），可选 */
  content_sha256?: string | null;
}

export interface ServerFolder {
  id: string;
  parent_id: string | null;
  name: string;
  sort_index: number;
  created_at: string;
  updated_at: string;
}

export interface FileTreeResponse {
  folders: ServerFolder[];
  files: ServerFile[];
}

export type FileOrderItem =
  | { type: "folder"; id: string }
  | { type: "file"; id: string };

export interface PutFileResult {
  ok?: boolean;
  skipped?: boolean;
  updated_at?: string;
  content_sha256?: string;
  version?: number;
  checkpoint?: {
    created: boolean;
    id?: string;
    label?: string;
    created_at?: string;
    content_sha256?: string | null;
  };
}

export interface PutFileThumbnailResult {
  ok?: boolean;
  updated_at?: string;
  content_sha256?: string;
  version?: number;
}

export interface ServerFileHash {
  id: string;
  content_sha256: string | null;
  version?: number;
}

export const ServerSync = {
  async listFiles(opts?: { signal?: AbortSignal }): Promise<ServerFile[]> {
    const list = await api<ServerFile[]>("/files", { signal: opts?.signal }, "listFiles");
    logSyncEvent("debug", "list_files.done", "listFiles", {
      count: list.length,
    });
    return list;
  },

  async listFileHashes(): Promise<ServerFileHash[]> {
    return api<ServerFileHash[]>("/files/hashes", {}, "listFileHashes");
  },

  listFileTree(opts?: { signal?: AbortSignal }): Promise<FileTreeResponse> {
    return api<FileTreeResponse>(
      "/files/tree",
      { signal: opts?.signal },
      "listFileTree",
    );
  },

  async createFile(
    name = "Untitled",
    folderId?: string | null,
    kind = "excalidraw",
  ): Promise<ServerFile> {
    const file = await api<ServerFile>("/files", {
      method: "POST",
      body: JSON.stringify({ name, folder_id: folderId ?? null, kind }),
    }, "createFile");
    if (typeof file.version === "number") {
      applyServerFileSessionVersion(file.id, file.version, "createFile");
      logDocumentVersion({
        action: "open-init",
        fileId: file.id,
        reason: "createFile",
        serverVersion: file.version,
        sessionVersion: getDocumentSessionVersion(file.id),
      });
    }
    return file;
  },

  createFolder(name: string, parentId?: string | null): Promise<ServerFolder> {
    return api("/files/folders", {
      method: "POST",
      body: JSON.stringify({ name, parent_id: parentId ?? null }),
    });
  },

  renameFolder(id: string, name: string): Promise<ServerFolder> {
    return api(`/files/folders/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
  },

  moveFolder(id: string, parentId: string | null): Promise<ServerFolder> {
    return api(`/files/folders/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ parent_id: parentId }),
    });
  },

  deleteFolder(id: string): Promise<unknown> {
    return api(`/files/folders/${id}`, { method: "DELETE" });
  },

  async getFile(id: string, opts?: { force?: boolean }): Promise<ServerFile> {
    const force = opts?.force === true;
    const priorHash = FileSyncState.getServerHash(id);
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(force
        ? {
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          }
        : {}),
    };
    if (priorHash && !force) {
      headers["If-None-Match"] = formatIfNoneMatchHeader(priorHash);
    }
    const forceNonce = () =>
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const requestPath = force ? `/files/${id}?force=${forceNonce()}` : `/files/${id}`;
    const fetchFile = (debugSource: string, path = requestPath) =>
      fetch(url(path), {
        cache: force ? "no-store" : "default",
        headers: {
          ...headers,
          ...buildClientRequestHeaders(debugSource),
        },
      });
    const res = await fetchFile(force ? "getFile-force" : "getFile");
    if (res.status === 304) {
      if (force) {
        logSyncEvent("warn", "get_file.force_304_retry", "getFile force received 304, retrying uncached", {
          id: id.slice(0, 8),
        });
        const retry = await fetchFile(
          "getFile-force-retry",
          `/files/${id}?force=${forceNonce()}`,
        );
        if (retry.status === 304) {
          throw new Error(
            `Force loading file ${id.slice(0, 8)} returned 304 twice`,
          );
        }
        return parseGetFileResponse(id, retry);
      }
      const cached = rebuildServerFileFromLocalCache(
        id,
        priorHash ?? FileSyncState.getServerHash(id),
      );
      if (cached) {
        logSyncEvent("debug", "get_file.cache_hit_304", "getFile 304 cache hit", {
          id: id.slice(0, 8),
        });
        const reconciled = await reconcileSessionVersionFromHashList(id, {
          listFileHashes: () => ServerSync.listFileHashes(),
          hasUnsavedChanges: FileSyncState.hasUnsavedChanges(id),
          cachedServerSha:
            cached.content_sha256 ??
            FileSyncState.getServerHash(id) ??
            FileSyncState.getLocalCache(id)?.meta?.serverContentSha256 ??
            null,
          reason: "getFile-304",
        });
        if (!reconciled && typeof cached.version === "number") {
          applyServerFileSessionVersion(
            id,
            cached.version,
            "getFile-304-cache-fallback",
          );
        }
        cached.version =
          getDocumentSessionVersion(id) ??
          FileSyncState.getLocalCache(id)?.meta?.serverVersion ??
          cached.version;
        return cached;
      }
      logSyncEvent("debug", "get_file.refetch_304", "getFile 304 without local cache, refetching", {
        id: id.slice(0, 8),
      });
      const full = await fetch(url(`/files/${id}?refetch=${forceNonce()}`), {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          ...buildClientRequestHeaders("getFile-304-refetch"),
        },
      });
      return parseGetFileResponse(id, full);
    }
    return parseGetFileResponse(id, res);
  },

  async saveFileImmediate(
    id: string,
    data: unknown,
    name?: string,
    thumbnail?: string | null,
    opts?: {
      suppressSavedEvent?: boolean;
      archiveLabel?: string;
      checkpointPolicy?: CheckpointPolicy;
      expectedVersion?: number | null;
      forceOverwrite?: boolean;
      source?: string;
    },
  ): Promise<PutFileResult> {
    return withFileSaveLock(id, opts?.source ?? null, async () => {
    const hasThumbnailField = thumbnail !== undefined;
    const contentHash = hashDocumentSnapshot(data);
    logSaveEvent("info", "immediate.start", "saveFileImmediate start", {
      clientTabId: getClientTabId(),
      id,
      id8: id.slice(0, 8),
      source: opts?.source ?? null,
      hasThumb: typeof thumbnail === "string" && thumbnail.length > 0,
      clearThumb: thumbnail === null,
      archiveLabel: opts?.archiveLabel ?? "",
      checkpointPolicy: opts?.checkpointPolicy?.mode ?? "none",
      contentHash8: contentHash.slice(0, 8),
      sessionVersion: getDocumentSessionVersion(id) ?? null,
      forceOverwrite: !!opts?.forceOverwrite,
    });
    const expectedVersionBeforePreflight =
      opts?.expectedVersion ?? getDocumentSessionVersion(id) ?? null;
    if (expectedVersionBeforePreflight === null) {
      await supplementSessionVersionIfMissing(id, {
        listFileHashes: () => ServerSync.listFileHashes(),
        hasUnsavedChanges: FileSyncState.hasUnsavedChanges(id),
        cachedServerSha:
          FileSyncState.getServerHash(id) ??
          FileSyncState.getLocalCache(id)?.meta?.serverContentSha256 ??
          null,
        reason: "save-preflight",
      });
    }
    const expectedVersion =
      opts?.expectedVersion ?? getDocumentSessionVersion(id) ?? null;
    logDocumentVersion({
      action: "save-attempt",
      fileId: id,
      reason: opts?.forceOverwrite ? "force-overwrite" : "save",
      sessionVersion: getDocumentSessionVersion(id),
      expectedVersion,
      forceOverwrite: opts?.forceOverwrite,
      source: opts?.source ?? null,
    });
    let result: PutFileResult;
    try {
      result = await api<PutFileResult>(`/files/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          data,
          clientDebug: {
            tabId: getClientTabId(),
            source: opts?.forceOverwrite
              ? "force-overwrite"
              : opts?.source ?? "save",
            contentHash,
            sessionVersion: getDocumentSessionVersion(id) ?? null,
            expectedVersion,
            clientTime: new Date().toISOString(),
          },
          ...(name ? { name } : {}),
          ...(hasThumbnailField ? { thumbnail } : {}),
          expectedVersion: expectedVersion ?? undefined,
          ...(opts?.forceOverwrite ? { forceOverwrite: true } : {}),
          ...(opts?.archiveLabel ? { archiveLabel: opts.archiveLabel } : {}),
          ...(opts?.checkpointPolicy
            ? { checkpointPolicy: opts.checkpointPolicy }
            : {}),
        }),
      }, opts?.forceOverwrite ? "force-overwrite" : opts?.source ?? "save");
    } catch (error) {
      if (isServerSyncVersionConflictError(error)) {
        const body = getServerSyncErrorJson(error) as
          | { version?: number }
          | null;
        logDocumentVersion({
          action: "save-conflict",
          fileId: id,
          reason: opts?.forceOverwrite ? "force-overwrite" : "save",
          sessionVersion: getDocumentSessionVersion(id),
          expectedVersion,
          serverVersion: body?.version ?? null,
          forceOverwrite: opts?.forceOverwrite,
          source: opts?.source ?? null,
        });
      }
      throw error;
    }
    if (result?.content_sha256) {
      FileSyncState.setServerHash(id, result.content_sha256);
    }
    if (typeof result?.version === "number") {
      setDocumentSessionVersion(id, result.version, {
        reason: result.skipped ? "save-skipped" : "save-success",
        serverVersion: result.version,
        expectedVersion,
        forceOverwrite: opts?.forceOverwrite,
      });
      updateLocalCacheServerVersionMeta(
        id,
        {
          content_sha256: result?.content_sha256 ?? null,
          version: result.version,
        },
        result.skipped ? "save-skipped" : "save-success",
      );
    }
    logDocumentVersion({
      action: result?.skipped ? "save-skipped" : "save-success",
      fileId: id,
      reason: opts?.forceOverwrite ? "force-overwrite" : "save",
      sessionVersion:
        typeof result?.version === "number"
          ? result.version
          : getDocumentSessionVersion(id),
      serverVersion: result?.version ?? null,
      expectedVersion,
      forceOverwrite: opts?.forceOverwrite,
      skipped: !!result?.skipped,
      source: opts?.source ?? null,
    });
    if (result?.skipped) {
      logHashEvent("debug", "server_saved.immediate_skipped", "server-saved (immediate) skipped", {
        id,
      });
      if (!opts?.suppressSavedEvent) {
        const hash = hashDocumentSnapshot(data);
        window.dispatchEvent(
          new CustomEvent("excalidraw-server-saved", {
            detail: { id, hash },
          }),
        );
      }
      return result;
    }
    if (!opts?.suppressSavedEvent) {
      const hash = hashDocumentSnapshot(data);
      logHashEvent("debug", "server_saved.immediate", "server-saved (immediate)", {
        id,
        hash,
      });
      window.dispatchEvent(
        new CustomEvent("excalidraw-server-saved", {
          detail: { id, hash },
        }),
      );
    }
    return result;
    });
  },

  async saveFileThumbnail(
    id: string,
    thumbnail: string,
    opts: {
      contentSha256: string;
      source?: string;
    },
  ): Promise<PutFileThumbnailResult> {
    return withFileSaveLock(id, opts.source ?? "thumbnail", async () => {
      logSaveEvent("info", "thumbnail.start", "saveFileThumbnail start", {
        clientTabId: getClientTabId(),
        id,
        id8: id.slice(0, 8),
        source: opts.source ?? "thumbnail",
        contentHash8: opts.contentSha256.slice(0, 8),
        thumbLen: thumbnail.length,
      });
      const result = await api<PutFileThumbnailResult>(
        `/files/${id}/thumbnail`,
        {
          method: "PUT",
          body: JSON.stringify({
            thumbnail,
            contentSha256: opts.contentSha256,
            clientDebug: {
              tabId: getClientTabId(),
              source: opts.source ?? "thumbnail",
              contentHash: opts.contentSha256,
              sessionVersion: getDocumentSessionVersion(id) ?? null,
              clientTime: new Date().toISOString(),
            },
          }),
        },
        opts.source ?? "thumbnail",
      );
      logSaveEvent("info", "thumbnail.done", "saveFileThumbnail done", {
        clientTabId: getClientTabId(),
        id,
        id8: id.slice(0, 8),
        source: opts.source ?? "thumbnail",
        contentHash8: result.content_sha256?.slice(0, 8) ?? null,
        version: result.version ?? null,
      });
      return result;
    });
  },

  renameFile(id: string, name: string): Promise<unknown> {
    return api(`/files/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
  },

  moveFiles(fileIds: string[], folderId: string | null): Promise<unknown> {
    return api("/files/move", {
      method: "POST",
      body: JSON.stringify({ file_ids: fileIds, folder_id: folderId }),
    });
  },

  saveOrder(parentId: string | null, items: FileOrderItem[]): Promise<unknown> {
    return api("/files/order", {
      method: "POST",
      body: JSON.stringify({ parent_id: parentId, items }),
    });
  },

  deleteFile(id: string): Promise<unknown> {
    return api(`/files/${id}`, { method: "DELETE" });
  },

  async downloadFile(id: string, fileName: string): Promise<void> {
    const file = await this.getFile(id);
    const managedDocument = normalizeDocument(file.data);
    const kind = managedDocument?.kind ?? file.kind ?? "excalidraw";
    const adapter = getDocumentFormatAdapter(kind);
    const data =
      managedDocument && adapter
        ? await adapter.serialize(managedDocument.data)
        : file.data;
    const extension = editorRegistry.getDownloadExtension(kind);
    const blob = new Blob(
      [typeof data === "string" ? data : `${JSON.stringify(data, null, 2)}\n`],
      {
        type: "application/json",
      },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const baseName = (fileName || "document").replace(
      /\.(excalidraw|smm|txt)$/i,
      "",
    );
    a.download = `${baseName}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  },

  listArchives(fileId: string): Promise<ArchiveEntry[]> {
    return api(`/files/${fileId}/archives`);
  },

  restoreArchive(
    fileId: string,
    archiveId: string,
    opts?: { backupCurrent?: boolean },
  ): Promise<unknown> {
    return api(`/files/${fileId}/restore/${archiveId}`, {
      method: "POST",
      body: JSON.stringify({ backupCurrent: opts?.backupCurrent !== false }),
    });
  },

  deleteArchive(fileId: string, archiveId: string): Promise<unknown> {
    return api(`/files/${fileId}/archives/${archiveId}`, {
      method: "DELETE",
    });
  },

  patchArchiveLabel(
    fileId: string,
    archiveId: string,
    label: string,
  ): Promise<ArchiveEntry> {
    return api(`/files/${fileId}/archives/${archiveId}`, {
      method: "PATCH",
      body: JSON.stringify({ label }),
    });
  },
};
