import type { ServerFile } from "@/types/file";
import { isLocalTempFileId } from "./tempFileId";

export interface TempFileRecord {
  id: string;
  name: string;
  kind: string;
  created_at: string;
  updated_at: string;
}

const INDEX_KEY = "drawing-space-temp-files";

function readIndex(): TempFileRecord[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is TempFileRecord =>
        !!item &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        isLocalTempFileId(item.id) &&
        typeof item.name === "string" &&
        typeof item.kind === "string",
    );
  } catch {
    return [];
  }
}

function writeIndex(records: TempFileRecord[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(records));
}

export const TempFileStorage = {
  list(): TempFileRecord[] {
    return readIndex().sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  },

  get(fileId: string): TempFileRecord | null {
    return readIndex().find((item) => item.id === fileId) ?? null;
  },

  upsert(record: TempFileRecord) {
    const next = readIndex().filter((item) => item.id !== record.id);
    next.unshift(record);
    writeIndex(next);
    window.dispatchEvent(
      new CustomEvent("temp-files-change", { detail: { fileId: record.id } }),
    );
  },

  touch(fileId: string, name?: string) {
    const records = readIndex();
    const existing = records.find((item) => item.id === fileId);
    if (!existing) return;
    const updated: TempFileRecord = {
      ...existing,
      name: name?.trim() || existing.name,
      updated_at: new Date().toISOString(),
    };
    this.upsert(updated);
  },

  remove(fileId: string) {
    writeIndex(readIndex().filter((item) => item.id !== fileId));
    window.dispatchEvent(
      new CustomEvent("temp-files-change", { detail: { fileId } }),
    );
  },
};

export function tempRecordToServerFile(record: TempFileRecord): ServerFile {
  return {
    id: record.id,
    name: record.name,
    kind: record.kind,
    folder_id: null,
    created_at: record.created_at,
    updated_at: record.updated_at,
    has_thumbnail: false,
    archive_count: 0,
    content_sha256: null,
  };
}
