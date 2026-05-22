export type BrowserSceneSnapshot = {
  v: 1;
  elements?: readonly unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
  updatedAt: string;
};

const STORAGE_PREFIX = "drawing-space-browser-scene:";

function storageKey(fileId: string) {
  return `${STORAGE_PREFIX}${fileId}`;
}

export const BrowserSceneStorage = {
  set(fileId: string, snapshot: Omit<BrowserSceneSnapshot, "v" | "updatedAt">) {
    try {
      localStorage.setItem(
        storageKey(fileId),
        JSON.stringify({
          v: 1,
          ...snapshot,
          updatedAt: new Date().toISOString(),
        } satisfies BrowserSceneSnapshot),
      );
    } catch {
      // Browser scene snapshots are a recovery aid; quota failures should not block editing.
    }
  },

  get(fileId: string): BrowserSceneSnapshot | null {
    try {
      const raw = localStorage.getItem(storageKey(fileId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<BrowserSceneSnapshot>;
      return parsed.v === 1 ? parsed as BrowserSceneSnapshot : null;
    } catch {
      return null;
    }
  },

  remove(fileId: string) {
    try {
      localStorage.removeItem(storageKey(fileId));
    } catch {
      // ignore
    }
  },
};
