export interface LocalDraft {
  fileId: string;
  data: string;
  hash: string;
  updatedAt: string;
}

const STORAGE_PREFIX = "excalidraw-web-local-draft:";

export const LocalDraftStorage = {
  get(fileId: string): LocalDraft | null {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${fileId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  set(fileId: string, data: string, hash: string) {
    const draft: LocalDraft = {
      fileId,
      data,
      hash,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(`${STORAGE_PREFIX}${fileId}`, JSON.stringify(draft));
  },

  remove(fileId: string) {
    localStorage.removeItem(`${STORAGE_PREFIX}${fileId}`);
  },
};
