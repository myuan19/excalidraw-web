export interface ServerFile {
  id: string;
  name: string;
  kind: "excalidraw" | "mindmap" | string;
  folder_id: string | null;
  created_at: string;
  updated_at: string;
  has_thumbnail: boolean;
  archive_count: number;
  sort_index?: number;
  content_sha256?: string | null;
  data?: unknown;
}

export interface ServerFolder {
  id: string;
  parent_id: string | null;
  name: string;
  sort_index: number;
  created_at: string;
  updated_at: string;
}

export type SortBy = "updatedAt" | "createdAt" | "name";
export type SortDir = "asc" | "desc";

export type SyncState = "synced" | "draft";

export interface FileTreeResponse {
  files: ServerFile[];
  folders: ServerFolder[];
}

export interface AIConfig {
  excalidraw: {
    endpoint: string;
    apiKey: string;
    textToDiagramModel: string;
    diagramToCodeModel: string;
    iconTagModel: string;
  };
  mindmap: {
    endpoint: string;
    apiKey: string;
    model: string;
  };
}

export interface EmbedToken {
  id: string;
  token: string;
  file_id: string;
  allowed_domains: string;
  created_at: string;
  usage_count?: number;
}

export type FileOrderItem =
  | { type: "folder"; id: string }
  | { type: "file"; id: string };

export interface ArchiveEntry {
  id: string;
  label: string;
  created_at: string;
  content_sha256?: string | null;
}

export interface ArchiveDetail extends ArchiveEntry {
  data: unknown;
}

export interface LibraryItem {
  id: string;
  scope: "public" | "personal" | "canvas" | string;
  file_id?: string | null;
  name: string;
  data: unknown;
  created_at: string;
  sort_index?: number;
}

export interface LibraryGroup {
  id: string;
  name: string;
  itemIds: string[];
  collapsed?: boolean;
}

export interface LibrarySyncPayload {
  publicItems?: LibraryItem[];
  personalItems?: LibraryItem[];
  canvasItems?: LibraryItem[];
  fileId?: string;
  groups?: LibraryGroup[];
}

export interface EmbedDataResponse {
  file?: Pick<ServerFile, "id" | "name" | "kind" | "updated_at" | "content_sha256">;
  id?: string;
  name?: string;
  kind?: string;
  data: unknown;
}
