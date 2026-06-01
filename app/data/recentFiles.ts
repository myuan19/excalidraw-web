export const RECENT_FILES_KEY = "editorhub-recent-files-v1";
export const RECENT_FILES_CHANGE_EVENT = "editorhub-recent-files-change";

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type RecentFileEntry = {
  id: string;
  accessedAt: string;
};

function readEntries(): RecentFileEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_FILES_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item): item is RecentFileEntry =>
        !!item &&
        typeof item === "object" &&
        typeof (item as RecentFileEntry).id === "string" &&
        typeof (item as RecentFileEntry).accessedAt === "string",
    );
  } catch {
    return [];
  }
}

function pruneEntries(entries: RecentFileEntry[]): RecentFileEntry[] {
  const cutoff = Date.now() - RECENT_WINDOW_MS;
  return entries.filter(
    (entry) => new Date(entry.accessedAt).getTime() >= cutoff,
  );
}

function writeEntries(entries: RecentFileEntry[]) {
  const pruned = pruneEntries(entries);
  try {
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(pruned));
    window.dispatchEvent(new CustomEvent(RECENT_FILES_CHANGE_EVENT));
  } catch {
    // best-effort
  }
}

/** 打开或编辑文件时调用：更新访问时间并置顶。 */
export function recordRecentFileAccess(fileId: string): void {
  if (!fileId) {
    return;
  }
  const now = new Date().toISOString();
  const next = [
    { id: fileId, accessedAt: now },
    ...readEntries().filter((entry) => entry.id !== fileId),
  ];
  writeEntries(next);
}

export function getRecentFileEntries(): RecentFileEntry[] {
  return pruneEntries(readEntries())
    .filter((entry) => !entry.id.startsWith("local-temp:"))
    .sort(
      (a, b) =>
        new Date(b.accessedAt).getTime() - new Date(a.accessedAt).getTime(),
    );
}

export function removeRecentFileEntry(fileId: string): void {
  writeEntries(readEntries().filter((entry) => entry.id !== fileId));
}
