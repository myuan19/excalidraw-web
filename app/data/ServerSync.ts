/**
 * Handles synchronization between the browser and the local server API.
 */

import { createLogger } from "../lib/logger";
import { devDebug, isFileListFolderDndDebugEnabled } from "../lib/devDebug";
import { FileSyncState } from "./FileSyncState";
import { getDocumentFormatAdapter } from "./formats/registry";
import { editorRegistry } from "../editors/registry";

import { hashDocumentSnapshot } from "./sceneHash";

import { normalizeDocument } from "./documentTypes";

import type { ForkSceneSnapshot } from "./forkFileTypes";

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

function rebuildServerFileFromLocalCache(
  fileId: string,
  contentSha256: string | null,
): ServerFile | null {
  const local = FileSyncState.getLocalCache(fileId);
  if (!local) {
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
      content_sha256: contentSha256,
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
      content_sha256: contentSha256,
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
  if (folderApiDebug) {
    devDebug("file-list", `folder-api request ${method}`, {
      path,
      bodyLen:
        typeof opts.body === "string" ? opts.body.length : opts.body ? 1 : 0,
    });
  }
  const res = await fetch(url(path), {
    headers: { "Content-Type": "application/json" },
    ...opts,
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
    logSync.debug(`api non-JSON ${res.status} ${elapsedMs()}ms`, {
      path,
      preview: text.slice(0, 120),
    });
    throw new Error(
      `API ${path} expected JSON but got ${ct || "unknown type"}.${hint}`,
    );
  }
  if (!res.ok) {
    const text = await res.text();
    logSync.debug(`api error ${res.status} ${elapsedMs()}ms`, {
      path,
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
    throw new Error(`API ${res.status}: ${text}`);
  }
  const data = (await res.json()) as T;
  logSync.debug(`api ok ${elapsedMs()}ms`, { path, method });
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
  res: Response,
): Promise<ServerFile> {
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const text = await res.text();
    throw new Error(
      `API /files/${id} expected JSON but got ${ct || "unknown type"}.`,
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  const file = (await res.json()) as ServerFile;
  const etag = res.headers.get("etag")?.replace(/^"|"$/g, "");
  const sha = file.content_sha256 ?? etag;
  if (sha) {
    FileSyncState.setServerHash(id, sha);
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
}

export interface ServerFileHash {
  id: string;
  content_sha256: string | null;
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
    return api<FileTreeResponse>("/files/tree", { signal: opts?.signal });
  },

  createFile(
    name = "Untitled",
    folderId?: string | null,
    kind = "excalidraw",
  ): Promise<ServerFile> {
    return api("/files", {
      method: "POST",
      body: JSON.stringify({ name, folder_id: folderId ?? null, kind }),
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

  deleteFolder(id: string): Promise<unknown> {
    return api(`/files/folders/${id}`, { method: "DELETE" });
  },

  async getFile(
    id: string,
    opts?: { force?: boolean },
  ): Promise<ServerFile> {
    const priorHash = FileSyncState.getServerHash(id);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (priorHash && !opts?.force) {
      headers["If-None-Match"] = formatIfNoneMatchHeader(priorHash);
    }
    const res = await fetch(url(`/files/${id}`), { headers });
    if (res.status === 304) {
      const cached = rebuildServerFileFromLocalCache(
        id,
        priorHash ?? FileSyncState.getServerHash(id),
      );
      if (cached) {
        logSync.debug(`getFile 304 cache hit`, { id: id.slice(0, 8) });
        return cached;
      }
      logSync.debug(`getFile 304 without local cache, refetching`, {
        id: id.slice(0, 8),
      });
      const full = await fetch(url(`/files/${id}`), {
        headers: { Accept: "application/json" },
      });
      return parseGetFileResponse(id, full);
    }
    return parseGetFileResponse(id, res);
  },

  async saveFileImmediate(
    id: string,
    data: unknown,
    name?: string,
    thumbnail?: string,
    opts?: { suppressSavedEvent?: boolean; archiveLabel?: string },
  ): Promise<PutFileResult> {
    logSave.debug("saveFileImmediate", {
      id,
      hasThumb: typeof thumbnail === "string" && thumbnail.length > 0,
      archiveLabel: opts?.archiveLabel ?? "",
    });
    const result = await api<PutFileResult>(`/files/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        data,
        ...(name ? { name } : {}),
        ...(thumbnail ? { thumbnail } : {}),
        ...(opts?.archiveLabel ? { archiveLabel: opts.archiveLabel } : {}),
      }),
    });
    if (result?.content_sha256) {
      FileSyncState.setServerHash(id, result.content_sha256);
    }
    if (result?.skipped) {
      logHash.debug("server-saved (immediate) skipped", { id });
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
      logHash.debug("server-saved (immediate)", { id, hash });
      window.dispatchEvent(
        new CustomEvent("excalidraw-server-saved", {
          detail: { id, hash },
        }),
      );
    }
    return result;
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
      [
        typeof data === "string"
          ? data
          : `${JSON.stringify(data, null, 2)}\n`,
      ],
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

  restoreArchive(fileId: string, archiveId: string): Promise<unknown> {
    return api(`/files/${fileId}/restore/${archiveId}`, {
      method: "POST",
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
