const RECENT_FILES_KEY = "drawing-space-recent-files";
const MAX_RECENT = 8;

export function getRecentFileIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_FILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

export function recordRecentFile(fileId: string): void {
  if (!fileId) return;
  const next = [fileId, ...getRecentFileIds().filter((id) => id !== fileId)].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(next));
  } catch {
    // Recent list is best-effort.
  }
}
