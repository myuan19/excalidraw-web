import type {
  AIConfig,
  ArchiveDetail,
  ArchiveEntry,
  EmbedDataResponse,
  EmbedToken,
  FileOrderItem,
  FileTreeResponse,
  LibraryGroup,
  LibraryItem,
  LibrarySyncPayload,
  ServerFile,
  ServerFolder,
} from "@/types/file";

import { ApiError, parseApiErrorBody } from "./apiError";

const API_BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const contentType = res.headers.get("content-type") ?? "";
    const raw = await res.text();
    const parsed = parseApiErrorBody(raw, contentType);
    const suffix = parsed.message ? `: ${parsed.message.slice(0, 300)}` : "";
    throw new ApiError(
      `API error ${res.status} ${res.statusText}${suffix}`,
      res.status,
      parsed.body,
    );
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `API returned non-JSON response for ${path}: ${text.slice(0, 300)}`,
    );
  }
}

export const ServerSync = {
  async listFileTree(): Promise<FileTreeResponse> {
    return request<FileTreeResponse>("/files/tree");
  },

  async listFileHashes(): Promise<Array<{ id: string; content_sha256: string | null }>> {
    return request<Array<{ id: string; content_sha256: string | null }>>("/files/hashes");
  },

  async createFile(name: string, kind: string, folderId: string | null): Promise<ServerFile> {
    return request<ServerFile>("/files", {
      method: "POST",
      body: JSON.stringify({ name, kind, folder_id: folderId }),
    });
  },

  async deleteFile(id: string): Promise<void> {
    await request(`/files/${id}`, { method: "DELETE" });
  },

  async getFile(id: string): Promise<ServerFile & { data: unknown }> {
    return request<ServerFile & { data: unknown }>(`/files/${id}`);
  },

  async renameFile(id: string, name: string): Promise<ServerFile> {
    return request<ServerFile>(`/files/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
  },

  async moveFiles(fileIds: string[], targetFolderId: string | null): Promise<void> {
    await request("/files/move", {
      method: "POST",
      body: JSON.stringify({ file_ids: fileIds, folder_id: targetFolderId }),
    });
  },

  async saveOrder(parentId: string | null, items: FileOrderItem[]): Promise<void> {
    await request("/files/order", {
      method: "POST",
      body: JSON.stringify({ parent_id: parentId, items }),
    });
  },

  async createFolder(name: string, parentId: string | null): Promise<ServerFolder> {
    return request<ServerFolder>("/files/folders", {
      method: "POST",
      body: JSON.stringify({ name, parent_id: parentId }),
    });
  },

  async renameFolder(id: string, name: string): Promise<ServerFolder> {
    return request<ServerFolder>(`/files/folders/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
  },

  async deleteFolder(id: string): Promise<void> {
    await request(`/files/folders/${id}`, { method: "DELETE" });
  },

  async moveFolder(id: string, parentId: string | null): Promise<ServerFolder> {
    return request<ServerFolder>(`/files/folders/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ parent_id: parentId }),
    });
  },

  async getFileData(id: string): Promise<unknown> {
    return (await this.getFile(id)).data;
  },

  async saveFileImmediate(
    id: string,
    data: unknown,
    name?: string,
    thumbnail?: string,
    expectedContentSha256?: string | null,
  ): Promise<{ ok?: boolean; skipped?: boolean; updated_at?: string; content_sha256?: string }> {
    return request(`/files/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        data,
        name,
        thumbnail,
        ...(expectedContentSha256 !== undefined
          ? { expected_content_sha256: expectedContentSha256 }
          : {}),
      }),
    });
  },

  async getThumbnail(id: string): Promise<string | null> {
    const res = await fetch(`${API_BASE}/files/${id}/thumbnail`);
    if (!res.ok) return null;
    return res.text();
  },

  async getAIConfig(): Promise<AIConfig> {
    return request<AIConfig>("/ai-settings");
  },

  async saveAIConfig(config: AIConfig): Promise<void> {
    await request("/ai-settings", {
      method: "PUT",
      body: JSON.stringify(config),
    });
  },

  async listEmbedTokens(fileId: string): Promise<EmbedToken[]> {
    return request<EmbedToken[]>(`/embed-tokens?file_id=${fileId}`);
  },

  async createEmbedToken(fileId: string, allowedDomains: string): Promise<EmbedToken> {
    return request<EmbedToken>("/embed-tokens", {
      method: "POST",
      body: JSON.stringify({ file_id: fileId, allowed_domains: allowedDomains }),
    });
  },

  async deleteEmbedToken(id: string): Promise<void> {
    await request(`/embed-tokens/${id}`, { method: "DELETE" });
  },

  async updateEmbedToken(id: string, allowedDomains: string): Promise<EmbedToken> {
    return request<EmbedToken>(`/embed-tokens/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ allowed_domains: allowedDomains }),
    });
  },

  async listArchives(fileId: string): Promise<ArchiveEntry[]> {
    return request<ArchiveEntry[]>(`/files/${fileId}/archives`);
  },

  async deleteArchive(fileId: string, archiveId: string): Promise<void> {
    await request(`/files/${fileId}/archives/${archiveId}`, { method: "DELETE" });
  },

  async createArchive(fileId: string, label = "", deltas?: unknown): Promise<ArchiveEntry> {
    return request<ArchiveEntry>(`/files/${fileId}/archive`, {
      method: "POST",
      body: JSON.stringify({ label, deltas }),
    });
  },

  async getArchive(fileId: string, archiveId: string): Promise<ArchiveDetail> {
    return request<ArchiveDetail>(`/files/${fileId}/archives/${archiveId}`);
  },

  async updateArchiveLabel(
    fileId: string,
    archiveId: string,
    label: string,
  ): Promise<ArchiveEntry> {
    return request<ArchiveEntry>(`/files/${fileId}/archives/${archiveId}`, {
      method: "PATCH",
      body: JSON.stringify({ label }),
    });
  },

  async restoreArchive(
    fileId: string,
    archiveId: string,
  ): Promise<{ ok: boolean; restored_from: string; updated_at: string; content_sha256?: string }> {
    return request(`/files/${fileId}/restore/${archiveId}`, { method: "POST" });
  },

  async listPublicLibraryItems(): Promise<LibraryItem[]> {
    return request<LibraryItem[]>("/library");
  },

  async listPersonalLibraryItems(): Promise<LibraryItem[]> {
    return request<LibraryItem[]>("/library/personal");
  },

  async listCanvasLibraryItems(fileId: string): Promise<LibraryItem[]> {
    return request<LibraryItem[]>(`/library/files/${fileId}`);
  },

  async listLibraryGroups(): Promise<LibraryGroup[]> {
    return request<LibraryGroup[]>("/library/groups");
  },

  async syncLibrary(payload: LibrarySyncPayload): Promise<void> {
    await request("/library/sync", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async getTTDChats(): Promise<unknown[]> {
    return request<unknown[]>("/ttd-chats");
  },

  async saveTTDChats(chats: unknown[]): Promise<void> {
    await request("/ttd-chats", {
      method: "PUT",
      body: JSON.stringify(chats),
    });
  },

  async getEmbedData(fileId: string, token: string): Promise<EmbedDataResponse> {
    const res = await fetch(`/embed/api/${fileId}/data?token=${encodeURIComponent(token)}`);
    if (!res.ok) {
      throw new Error(`Embed API error ${res.status} ${res.statusText}: ${(await res.text()).slice(0, 300)}`);
    }
    return res.json() as Promise<EmbedDataResponse>;
  },
};
