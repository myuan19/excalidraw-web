/**
 * Handles synchronization between the browser and the local server API.
 */

import { createLogger } from "../lib/logger";
import { FileSyncState } from "./FileSyncState";
import { getDocumentFormatAdapter } from "./formats/registry";

import { hashDocumentSnapshot } from "./sceneHash";

import { normalizeDocument } from "./documentTypes";

import type { ForkSceneSnapshot } from "./forkFileTypes";

const logSync = createLogger({ module: "sync" });
const logSave = createLogger({ module: "save" });
const logHash = createLogger({ module: "hash" });

function url(path: string): string {
  return `/api${path}`;
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
  logSync.debug(`api ${method}`, { path });
  const res = await fetch(url(path), {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const text = await res.text();
    const looksLikeHtml =
      text.trimStart().startsWith("<!DOCTYPE") ||
      text.trimStart().startsWith("<html");
    const hint = looksLikeHtml
      ? import.meta.env.DEV
        ? " Got HTML instead of JSON — the Vite dev server is serving the SPA for /api (API not reached). Run ./_scripts/run.sh dev so Express runs on :3033 with proxy, or start server/index.js and set VITE_DEV_API_PROXY_TARGET in .env.development, then restart Vite."
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
    throw new Error(`API ${res.status}: ${text}`);
  }
  const data = (await res.json()) as T;
  logSync.debug(`api ok ${elapsedMs()}ms`, { path, method });
  if (method === "PUT" && path.includes("/files/")) {
    logSync.debug("api PUT ok", { path, data });
  }
  return data;
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

/** 与 server/routes/files.js 中 MAX_ARCHIVES_PER_FILE 一致 */
export const MAX_ARCHIVES_PER_FILE = 8;

/** 上传前若已达存档上限，先删最旧一条，避免与服务端快照逻辑冲突或旧版服务端未先修剪时失败 */
async function ensureArchiveHeadroomBeforeSave(fileId: string): Promise<void> {
  const archives = await api<ArchiveEntry[]>(`/files/${fileId}/archives`);
  if (archives.length < MAX_ARCHIVES_PER_FILE) {
    return;
  }
  const oldest = [...archives].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )[0];
  if (oldest) {
    await api(`/files/${fileId}/archives/${oldest.id}`, { method: "DELETE" });
  }
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

  getFile(id: string): Promise<ServerFile> {
    return api(`/files/${id}`);
  },

  async saveFileImmediate(
    id: string,
    data: unknown,
    name?: string,
    thumbnail?: string,
    opts?: { suppressSavedEvent?: boolean },
  ): Promise<PutFileResult> {
    logSave.debug("saveFileImmediate", {
      id,
      hasThumb: typeof thumbnail === "string" && thumbnail.length > 0,
    });
    try {
      await ensureArchiveHeadroomBeforeSave(id);
    } catch {
      // 服务端也会在写入前修剪；预删失败不阻断保存
    }
    const result = await api<PutFileResult>(`/files/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        data,
        ...(name ? { name } : {}),
        ...(thumbnail ? { thumbnail } : {}),
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
    const extension =
      kind === "mindmap" ? "smm" : kind === "text" ? "txt" : "excalidraw";
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
