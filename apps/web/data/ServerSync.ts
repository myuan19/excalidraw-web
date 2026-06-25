/**
 * Handles synchronization between the browser and the local server API.
 */

import { createLogger } from "../lib/logger";
import { devDebug, isFileListFolderDndDebugEnabled } from "../lib/devDebug";

import { editorRegistry } from "../editors/registry";

import { withCatalogImportRetry } from "./catalogSaveRetry";
import { broadcastFileSaved } from "./crossTabFileSync";
import { FileSyncState } from "./FileSyncState";
import { getDocumentFormatAdapter } from "./formats/registry";

import { hashDocumentSnapshot } from "./sceneHash";
import { isLocalCacheConsistentWithServerHash } from "./localCacheServerConsistency";

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
import { shouldBlockPassiveSave } from "./fileSyncOperationState";
import { isLocalDraftFileId } from "./localDraftFileId";
import { LocalDraftSessions } from "./localDraftSessions";
import {
  readFileListTreeCache,
  readFileListTreeCacheEtag,
  writeFileListTreeCacheEtag,
} from "./fileListSessionCache";
import { apiTransport } from "./apiTransport";

import type { ApiTransportResponse } from "./apiTransportTypes";
import type { CheckpointPolicy } from "./checkpointPolicy";
import type { ForkSceneSnapshot } from "./forkFileTypes";
import type { SaveToServerSource } from "../hooks/types";

const logSync = createLogger({ module: "sync" });
const logSave = createLogger({ module: "save" });
const logHash = createLogger({ module: "hash" });

function url(path: string): string {
  return `/api${path}`;
}

function formatIfNoneMatchHeader(sha256: string): string {
  const trimmed = sha256.trim();
  return trimmed.startsWith('"') ? trimmed : `"${trimmed}"`;
}

function dispatchServerSavedEvents(
  id: string,
  data: unknown,
  result: PutFileResult,
): void {
  const hash = hashDocumentSnapshot(data);
  logHash.debug("server-saved (immediate)", {
    id,
    hash,
    skipped: !!result.skipped,
    sha8: result.content_sha256?.slice(0, 8) ?? null,
    version: result.version ?? null,
  });
  window.dispatchEvent(
    new CustomEvent("excalidraw-server-saved", {
      detail: {
        id,
        hash,
        contentSha256: result.content_sha256 ?? null,
        version: result.version ?? null,
        updatedAt: result.updated_at ?? null,
        skipped: !!result.skipped,
      },
    }),
  );
  if (!result.skipped) {
    broadcastFileSaved(id, {
      contentSha256: result.content_sha256 ?? null,
      version: result.version ?? null,
    });
  }
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
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.catch(() => undefined).then(() => current);
  saveLocks.set(fileId, chained);
  logSave.debug("file save lock queued", {
    lockId,
    fileId8: fileId.slice(0, 8),
    source: source ?? null,
    clientTabId: getClientTabId(),
  });
  await previous.catch(() => undefined);
  try {
    logSave.debug("file save lock acquired", {
      lockId,
      fileId8: fileId.slice(0, 8),
      waitMs: Date.now() - queuedAt,
    });
    return await run();
  } finally {
    release();
    if (saveLocks.get(fileId) === chained) {
      saveLocks.delete(fileId);
    }
    logSave.debug("file save lock released", {
      lockId,
      fileId8: fileId.slice(0, 8),
      heldMs: Date.now() - queuedAt,
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

export function isServerSyncVersionConflictError(error: unknown): boolean {
  return error instanceof ServerSyncError && error.status === 409;
}

export function isServerSyncNotFoundError(error: unknown): boolean {
  return error instanceof ServerSyncError && error.status === 404;
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

function normalizeSaveSourceForPolicy(
  source: string | null | undefined,
): SaveToServerSource | null {
  if (source === "manual") {
    return "sidebar";
  }
  if (source === "exit") {
    return "home";
  }
  if (
    source === "toolbar" ||
    source === "hotkey" ||
    source === "visibility" ||
    source === "home" ||
    source === "sidebar" ||
    source === "auto" ||
    source === "thumbnail"
  ) {
    return source;
  }
  return null;
}

function resolveLocalDraftDataFromCache(cache: unknown): unknown {
  if (!cache || typeof cache !== "object") {
    return cache;
  }
  const record = cache as { document?: { data?: unknown } | unknown };
  if (record.document && typeof record.document === "object") {
    const doc = record.document as { data?: unknown };
    return doc.data ?? record.document;
  }
  return cache;
}

function resolveLocalDraftServerFile(fileId: string): ServerFile | null {
  const meta = LocalDraftSessions.get(fileId);
  const cache = FileSyncState.getLocalCache(fileId);
  if (!meta || !cache) {
    return null;
  }
  return {
    id: fileId,
    name: meta.name,
    kind: meta.kind,
    created_at: meta.created_at,
    updated_at: meta.updated_at,
    folder_id: meta.folder_id ?? null,
    content_sha256: FileSyncState.getBaselineHash(fileId),
    data: resolveLocalDraftDataFromCache(cache),
  };
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
  if (contentSha256 && cachedServerSha && cachedServerSha !== contentSha256) {
    logSync.warn("getFile 304 cache meta mismatch; refetching", {
      id: fileId.slice(0, 8),
      expectedSha8: contentSha256.slice(0, 8),
      cachedSha8: cachedServerSha.slice(0, 8),
    });
    return null;
  }
  const doc = (
    local as { document?: { kind?: string; name?: string; data?: unknown } }
  ).document;
  if (doc?.kind === "mindmap") {
    return {
      id: fileId,
      name: doc.name ?? "",
      kind: "mindmap",
      created_at: "",
      updated_at: "",
      content_sha256: cachedServerSha ?? contentSha256,
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
      content_sha256: cachedServerSha ?? contentSha256,
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
  logSync.debug(`api ${method}`, { path });
  devDebug("api-sync", `api ${method} | request`, {
    path,
    bodyLen:
      typeof opts.body === "string" ? opts.body.length : opts.body ? 1 : 0,
  });
  if (folderApiDebug) {
    devDebug("file-list", `folder-api request ${method}`, {
      path,
      bodyLen:
        typeof opts.body === "string" ? opts.body.length : opts.body ? 1 : 0,
    });
  }
  const res = await apiTransport.request({
    method,
    path: url(path),
    headers: {
      "Content-Type": "application/json",
      ...buildClientRequestHeaders(debugSource),
      ...(opts.headers as Record<string, string> | undefined),
    },
    body:
      typeof opts.body === "string"
        ? opts.body
        : opts.body === undefined || opts.body === null
        ? null
        : null,
  });
  const ct = res.headers["content-type"] || "";
  if (!ct.includes("application/json")) {
    const text = res.bodyText;
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
    logSync.debug(`api non-JSON ${res.status} ${elapsedMs()}ms`, {
      path,
      preview: text.slice(0, 120),
    });
    devDebug("api-sync", `api ${method} | non-JSON ${res.status}`, {
      path,
      contentType: ct || null,
      preview: text.slice(0, 200),
    });
    throw new Error(
      `API ${path} expected JSON but got ${ct || "unknown type"}.${hint}`,
    );
  }
  if (res.status < 200 || res.status >= 300) {
    const text = res.bodyText;
    logSync.debug(`api error ${res.status} ${elapsedMs()}ms`, {
      path,
      preview: text.slice(0, 200),
    });
    devDebug("api-sync", `api ${method} | error ${res.status}`, {
      path,
      elapsedMs: elapsedMs(),
      preview: text.slice(0, 240),
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
  const data = JSON.parse(res.bodyText) as T;
  logSync.debug(`api ok ${elapsedMs()}ms`, { path, method });
  devDebug("api-sync", `api ${method} | ok ${res.status}`, {
    path,
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
    logSync.debug("api PUT ok", { path, data });
  }
  return data;
}

async function parseGetFileResponse(
  id: string,
  res: ApiTransportResponse,
): Promise<ServerFile> {
  const ct = res.headers["content-type"] || "";
  if (!ct.includes("application/json")) {
    throw new Error(
      `API /files/${id} expected JSON but got ${ct || "unknown type"}.`,
    );
  }
  if (res.status < 200 || res.status >= 300) {
    const text = res.bodyText;
    throw new ServerSyncError(
      `API ${res.status}: ${text}`,
      res.status,
      `/files/${id}`,
      text,
    );
  }
  const file = JSON.parse(res.bodyText) as ServerFile;
  const etag = res.headers.etag?.replace(/^"|"$/g, "");
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
  /** Desktop 映射：managed = 普通目录文件，external = 最近中打开的原路径文件 */
  origin?: "managed" | "discovered" | "external";
  importable?: boolean;
  /** Desktop 扫描：ok = 可解析，corrupt = 损坏 */
  health?: "ok" | "corrupt";
  corrupt?: boolean;
  parse_error?: string | null;
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
  is_mapping_root?: boolean;
}

export interface CatalogCapabilities {
  folderMapping: boolean;
  addMappedFolder: boolean;
  archivesEnabled: boolean;
}

export interface CatalogScanStatus {
  state: "idle" | "running" | "error";
  running?: boolean;
  pass?: string | null;
  processed?: number;
  folders?: number;
  files?: number;
  error?: string | null;
}

export interface FileTreeResponse {
  folders: ServerFolder[];
  files: ServerFile[];
  capabilities?: CatalogCapabilities;
  scan?: CatalogScanStatus;
}

export interface MappingRootResult {
  folder: ServerFolder | null;
  mappingRoot: {
    id: string;
    absPath: string;
    mountFolderId: string;
  };
  tree: FileTreeResponse;
}

export type FileOrderItem =
  | { type: "folder"; id: string }
  | { type: "file"; id: string };

export interface PutFileResult {
  ok?: boolean;
  skipped?: boolean;
  updated_at?: string;
  name?: string;
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

export interface ServerFileHash {
  id: string;
  content_sha256: string | null;
  version?: number;
}

export type CatalogChangeSubscription = () => void;

let listFileTreeInflight: Promise<FileTreeResponse> | null = null;

export function resetListFileTreeInflightForTests(): void {
  listFileTreeInflight = null;
}

async function fetchFileTreeFromApi(opts?: {
  signal?: AbortSignal;
}): Promise<FileTreeResponse> {
  const priorEtag = readFileListTreeCacheEtag();
  const headers: Record<string, string> = {
    ...buildClientRequestHeaders(),
  };
  if (priorEtag) {
    headers["If-None-Match"] = priorEtag;
  }
  const t0 =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const res = await apiTransport.request({
    method: "GET",
    path: url("/files/tree"),
    headers,
  });
  const elapsedMs = () =>
    Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) -
        t0,
    );
  if (res.status === 304) {
    const cached = readFileListTreeCache();
    devDebug("file-list", "[DEBUG] listFileTree | 304 not modified", {
      etag: priorEtag,
      elapsedMs: elapsedMs(),
      cached: !!cached,
    });
    if (cached) {
      return cached;
    }
  }
  const ct =
    res.headers["content-type"] || res.headers["Content-Type"] || "";
  if (!ct.includes("application/json")) {
    const text = res.bodyText;
    throw new Error(`API /files/tree expected JSON: ${text.slice(0, 120)}`);
  }
  if (res.status < 200 || res.status >= 300) {
    const text = res.bodyText;
    throw new ServerSyncError(
      `API /files/tree failed: ${res.status}`,
      res.status,
      "/files/tree",
      text,
    );
  }
  const tree = JSON.parse(res.bodyText) as FileTreeResponse;
  const etag = res.headers.etag || res.headers.ETag;
  if (etag) {
    writeFileListTreeCacheEtag(etag);
  }
  logSync.debug("listFileTree", {
    folders: tree.folders?.length ?? 0,
    files: tree.files?.length ?? 0,
    etag: etag ?? null,
    elapsedMs: elapsedMs(),
  });
  return tree;
}

async function listFileTreeConditional(opts?: {
  signal?: AbortSignal;
}): Promise<FileTreeResponse> {
  if (listFileTreeInflight) {
    return listFileTreeInflight;
  }
  listFileTreeInflight = fetchFileTreeFromApi(opts).finally(() => {
    listFileTreeInflight = null;
  });
  return listFileTreeInflight;
}

export const ServerSync = {
  async listFiles(opts?: { signal?: AbortSignal }): Promise<ServerFile[]> {
    const list = await api<ServerFile[]>("/files", { signal: opts?.signal });
    logSync.debug("listFiles", { count: list.length });
    return list;
  },

  async listFileHashes(): Promise<ServerFileHash[]> {
    return api<ServerFileHash[]>("/files/hashes");
  },

  listFileTree(opts?: { signal?: AbortSignal }): Promise<FileTreeResponse> {
    return listFileTreeConditional(opts);
  },

  getCatalogScanStatus(opts?: { signal?: AbortSignal }): Promise<CatalogScanStatus> {
    return api<CatalogScanStatus>("/files/scan-status", {
      signal: opts?.signal,
    });
  },

  getCatalogCapabilities(): Promise<CatalogCapabilities> {
    return api<CatalogCapabilities>("/files/capabilities").catch(() => ({
      folderMapping: false,
      addMappedFolder: false,
      archivesEnabled: true,
    }));
  },

  addMappingRoot(
    absPath: string,
    parentFolderId?: string | null,
  ): Promise<MappingRootResult> {
    return api<MappingRootResult>("/files/mapping-roots", {
      method: "POST",
      body: JSON.stringify({
        absPath,
        parent_folder_id: parentFolderId ?? null,
      }),
    });
  },

  importCatalogFile(fileId: string): Promise<ServerFile> {
    return api<ServerFile>(`/files/${fileId}/import`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  rescanCatalog(): Promise<FileTreeResponse> {
    return api<FileTreeResponse>("/files/rescan", { method: "POST" });
  },

  resolveCatalogFileByPath(
    absPath: string,
  ): Promise<{ absPath: string; file: ServerFile }> {
    return api<{ absPath: string; file: ServerFile }>("/files/resolve-path", {
      method: "POST",
      body: JSON.stringify({ absPath }),
    });
  },

  trackCatalogFileByPath(
    absPath: string,
  ): Promise<{ absPath: string; file: ServerFile; tracked?: boolean }> {
    return api<{ absPath: string; file: ServerFile; tracked?: boolean }>(
      "/files/track-path",
      {
        method: "POST",
        body: JSON.stringify({ absPath }),
      },
    );
  },

  subscribeCatalogChanges(onChange: () => void): CatalogChangeSubscription {
    return apiTransport.subscribeCatalogChanges(() => {
      onChange();
    });
  },

  createFile(
    name = "Untitled",
    folderId?: string | null,
    kind = "excalidraw",
  ): Promise<ServerFile> {
    return api<ServerFile>("/files", {
      method: "POST",
      body: JSON.stringify({ name, folder_id: folderId ?? null, kind }),
    }).then((file) => {
      if (typeof file.version === "number") {
        applyServerFileSessionVersion(file.id, file.version, "createFile");
      }
      return file;
    });
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

  deleteFolder(id: string): Promise<{
    ok: true;
    removed_mapping_root?: boolean;
    scan?: CatalogScanStatus;
  }> {
    return api(`/files/folders/${id}`, { method: "DELETE" });
  },

  openLocalFolder(id: string): Promise<{ ok: true }> {
    return api(`/files/folders/${id}/open-local`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  openLocalFile(id: string): Promise<{ ok: true }> {
    return api(`/files/${id}/open-local`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  async getFile(id: string, opts?: { force?: boolean }): Promise<ServerFile> {
    if (isLocalDraftFileId(id)) {
      const localDraft = resolveLocalDraftServerFile(id);
      if (localDraft) {
        logSync.debug("getFile local-draft from cache", {
          id8: id.slice(0, 20),
          force: !!opts?.force,
        });
        return localDraft;
      }
      throw new ServerSyncError(
        `Local draft ${id.slice(0, 20)} is not on server`,
        404,
        `/files/${id}`,
        "",
      );
    }

    const force = opts?.force === true;
    const priorHash = FileSyncState.getServerHash(id);
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...buildClientRequestHeaders(force ? "getFile-force" : "getFile"),
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
    const requestPath = force
      ? `/files/${id}?force=${forceNonce()}`
      : `/files/${id}`;
    const res = await apiTransport.request({
      method: "GET",
      path: url(requestPath),
      headers,
    });
    devDebug("api-sync", "getFile | fetch", {
      id8: id.slice(0, 20),
      force: !!opts?.force,
      ifNoneMatch: !!headers["If-None-Match"],
    });
    if (res.status === 304) {
      if (force) {
        const retry = await apiTransport.request({
          method: "GET",
          path: url(`/files/${id}?force=${forceNonce()}`),
          headers: {
            Accept: "application/json",
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
            ...buildClientRequestHeaders("getFile-force-retry"),
          },
        });
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
      if (
        cached &&
        isLocalCacheConsistentWithServerHash(
          id,
          priorHash ?? FileSyncState.getServerHash(id),
        )
      ) {
        logSync.debug(`getFile 304 cache hit`, { id: id.slice(0, 8) });
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
      logSync.debug(`getFile 304 without valid local cache, refetching`, {
        id: id.slice(0, 8),
      });
      const full = await apiTransport.request({
        method: "GET",
        path: url(`/files/${id}?refetch=${forceNonce()}`),
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
    if (isLocalDraftFileId(id)) {
      logSave.debug("saveFileImmediate skipped local-draft", {
        id: id.slice(0, 24),
      });
      return { ok: true, skipped: true };
    }
    const policySource = normalizeSaveSourceForPolicy(opts?.source);
    if (policySource && shouldBlockPassiveSave(id, policySource)) {
      logSave.info("saveFileImmediate skipped passive save during remote op", {
        id: id.slice(0, 8),
        source: opts?.source ?? null,
      });
      return { ok: false };
    }

    return withFileSaveLock(id, opts?.source ?? null, async () => {
      const hasThumbnailField = thumbnail !== undefined;
      const contentHash = hashDocumentSnapshot(data);
      logSave.debug("saveFileImmediate", {
        id,
        hasThumb: typeof thumbnail === "string" && thumbnail.length > 0,
        clearThumb: thumbnail === null,
        archiveLabel: opts?.archiveLabel ?? "",
        checkpointPolicy: opts?.checkpointPolicy?.mode ?? "none",
        contentHash8: contentHash.slice(0, 8),
        sessionVersion: getDocumentSessionVersion(id),
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

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const expectedServerHash = FileSyncState.getServerHash(id);
      if (expectedServerHash && !opts?.forceOverwrite) {
        headers["If-Match"] = formatIfNoneMatchHeader(expectedServerHash);
      }
      const savePath = opts?.source
        ? `/files/${id}?source=${encodeURIComponent(opts.source)}`
        : `/files/${id}`;
      const performSave = () =>
        api<PutFileResult>(
          savePath,
          {
            method: "PUT",
            headers,
            body: JSON.stringify({
              data,
              ...(name ? { name } : {}),
              ...(hasThumbnailField ? { thumbnail } : {}),
              expectedVersion: expectedVersion ?? undefined,
              ...(opts?.forceOverwrite ? { forceOverwrite: true } : {}),
              ...(opts?.archiveLabel
                ? { archiveLabel: opts.archiveLabel }
                : {}),
              ...(opts?.checkpointPolicy
                ? { checkpointPolicy: opts.checkpointPolicy }
                : {}),
            }),
          },
          opts?.forceOverwrite ? "force-overwrite" : opts?.source ?? "save",
        );
      let result: PutFileResult;
      try {
        result = await withCatalogImportRetry(id, performSave);
      } catch (error) {
        if (isServerSyncVersionConflictError(error)) {
          const body = getServerSyncErrorJson(error) as {
            version?: number;
          } | null;
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
      if (!opts?.suppressSavedEvent) {
        dispatchServerSavedEvents(id, data, result);
      }
      return result;
    });
  },

  async saveThumbnailOnly(
    id: string,
    thumbnail: string,
    name?: string,
  ): Promise<PutFileResult> {
    if (isLocalDraftFileId(id)) {
      devDebug("api-sync", "saveThumbnailOnly skipped local-draft", {
        fileId8: id.slice(0, 8),
      });
      return { ok: true, skipped: true };
    }
    devDebug("api-sync", "[DEBUG] saveThumbnailOnly | start", {
      fileId8: id.slice(0, 8),
      svgLen: thumbnail.length,
    });
    const performSave = () =>
      api<PutFileResult>(
        `/files/${id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            ...(name ? { name } : {}),
            thumbnail,
          }),
        },
        "thumbnail",
      );
    const result = await withCatalogImportRetry(id, performSave);
    if (typeof result?.version === "number") {
      setDocumentSessionVersion(id, result.version, {
        reason: "thumbnail-save",
        serverVersion: result.version,
      });
    }
    return result;
  },

  renameFile(id: string, name: string): Promise<ServerFile> {
    return api<ServerFile>(`/files/${id}`, {
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

  createArchive(
    fileId: string,
    label: string,
    deltas?: unknown[],
  ): Promise<ArchiveEntry> {
    return api(`/files/${fileId}/archive`, {
      method: "POST",
      body: JSON.stringify({ label, deltas }),
    });
  },

  listArchives(fileId: string): Promise<ArchiveEntry[]> {
    return api(`/files/${fileId}/archives`);
  },

  getArchive(fileId: string, archiveId: string): Promise<unknown> {
    return api(`/files/${fileId}/archives/${archiveId}`);
  },

  restoreArchive(
    fileId: string,
    archiveId: string,
    opts?: { backupCurrent?: boolean },
  ): Promise<unknown> {
    return api<{ version?: number }>(`/files/${fileId}/restore/${archiveId}`, {
      method: "POST",
      body: JSON.stringify({ backupCurrent: opts?.backupCurrent !== false }),
    }).then((result) => {
      if (typeof result?.version === "number") {
        applyServerFileSessionVersion(
          fileId,
          result.version,
          "archive-restore",
        );
      }
      return result;
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
