import { readStoredLocalDraftModified } from "./fileModificationState";
import { FileSyncState } from "./FileSyncState";
import { isLocalDraftFileId } from "./localDraftFileId";
import { recordRecentFileAccess, removeRecentFileEntry } from "./recentFiles";

import type { ServerFile } from "./ServerSync";

export interface LocalDraftSessionRecord {
  id: string;
  name: string;
  kind: string;
  created_at: string;
  updated_at: string;
  /**
   * 在「所有文件」某文件夹内新建时写入；保存时不再选路径。
   * 未设置（undefined）表示离开保存时需选择文件夹。
   */
  folder_id?: string | null;
}

const INDEX_KEY = "editorhub-local-draft-index-v1";
export const LOCAL_DRAFT_SESSIONS_CHANGE_EVENT =
  "editorhub-local-draft-sessions-change";

function readIndex(): LocalDraftSessionRecord[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item): item is LocalDraftSessionRecord =>
        !!item &&
        typeof item === "object" &&
        typeof (item as LocalDraftSessionRecord).id === "string" &&
        isLocalDraftFileId((item as LocalDraftSessionRecord).id) &&
        typeof (item as LocalDraftSessionRecord).name === "string" &&
        typeof (item as LocalDraftSessionRecord).kind === "string",
    );
  } catch {
    return [];
  }
}

function writeIndex(records: LocalDraftSessionRecord[]) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(records));
    window.dispatchEvent(new CustomEvent(LOCAL_DRAFT_SESSIONS_CHANGE_EVENT));
  } catch {
    /* ignore */
  }
}

/** 浏览器里仍有可恢复的本地草稿（有实质编辑 / 崩溃前已落盘）。 */
export function hasRecoverableLocalDraft(fileId: string): boolean {
  if (!isLocalDraftFileId(fileId)) {
    return false;
  }
  const meta = LocalDraftSessions.get(fileId);
  return readStoredLocalDraftModified(fileId, meta?.kind);
}

export const LocalDraftSessions = {
  /** 索引中的全部本地草稿（含尚无实质内容的会话）。 */
  listIndexed(): LocalDraftSessionRecord[] {
    return readIndex();
  },

  list(): LocalDraftSessionRecord[] {
    return readIndex()
      .filter((record) => hasRecoverableLocalDraft(record.id))
      .sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      );
  },

  get(fileId: string): LocalDraftSessionRecord | null {
    return readIndex().find((item) => item.id === fileId) ?? null;
  },

  upsert(record: LocalDraftSessionRecord) {
    const next = readIndex().filter((item) => item.id !== record.id);
    next.unshift(record);
    writeIndex(next);
  },

  touch(fileId: string, name?: string) {
    const existing = readIndex().find((item) => item.id === fileId);
    if (!existing) {
      return;
    }
    this.upsert({
      ...existing,
      name: name?.trim() || existing.name,
      updated_at: new Date().toISOString(),
    });
  },

  remove(fileId: string) {
    writeIndex(readIndex().filter((item) => item.id !== fileId));
  },
};

export function draftSessionToServerFile(
  record: LocalDraftSessionRecord,
): ServerFile {
  const edited = FileSyncState.getLocalEditTime(record.id);
  return {
    id: record.id,
    name: record.name,
    kind: record.kind,
    folder_id: record.folder_id ?? null,
    created_at: record.created_at,
    updated_at: edited ?? record.updated_at,
    has_thumbnail: false,
    archive_count: 0,
    content_sha256: null,
  };
}

/** 本地草稿产生未保存编辑时：更新索引并进入「最近」。 */
export function notifyLocalDraftEdited(fileId: string, name?: string): void {
  if (!isLocalDraftFileId(fileId)) {
    return;
  }
  LocalDraftSessions.touch(fileId, name);
  recordRecentFileAccess(fileId);
}

export function removeLocalDraftFromRecent(fileId: string): void {
  removeRecentFileEntry(fileId);
}
