import type { SyncState } from "@/types/file";

type FileSyncSnapshot = {
  fileId: string;
  baselineHash: string | null;
  draftHash: string | null;
  serverHash: string | null;
  updatedAt: string;
};

export interface ServerHashEntry {
  id: string;
  content_sha256: string | null;
}

const STORAGE_KEY = "excalidraw-web-file-sync-state";

function readAll(): Record<string, FileSyncSnapshot> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(value: Record<string, FileSyncSnapshot>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export const FileSyncState = {
  get(fileId: string): FileSyncSnapshot | null {
    return readAll()[fileId] ?? null;
  },

  markOpened(fileId: string, serverHash: string | null) {
    const all = readAll();
    const previous = all[fileId];
    const hasDraft = !!previous?.draftHash && previous.draftHash !== serverHash;
    all[fileId] = {
      fileId,
      baselineHash: hasDraft ? previous.baselineHash ?? previous.serverHash ?? serverHash : serverHash,
      draftHash: previous?.draftHash ?? null,
      serverHash,
      updatedAt: new Date().toISOString(),
    };
    writeAll(all);
    window.dispatchEvent(new CustomEvent("file-sync-state-change", { detail: { fileId } }));
  },

  markDraft(fileId: string, draftHash: string) {
    const all = readAll();
    const previous = all[fileId];
    all[fileId] = {
      fileId,
      baselineHash: previous?.baselineHash ?? null,
      draftHash,
      serverHash: previous?.serverHash ?? null,
      updatedAt: new Date().toISOString(),
    };
    writeAll(all);
    window.dispatchEvent(new CustomEvent("file-sync-state-change", { detail: { fileId } }));
  },

  markServerHash(fileId: string, serverHash: string | null) {
    const all = readAll();
    const previous = all[fileId];
    all[fileId] = {
      fileId,
      baselineHash: previous?.baselineHash ?? serverHash,
      draftHash: previous?.draftHash ?? null,
      serverHash,
      updatedAt: new Date().toISOString(),
    };
    writeAll(all);
    window.dispatchEvent(new CustomEvent("file-sync-state-change", { detail: { fileId } }));
  },

  markServerHashes(entries: ServerHashEntry[]) {
    const all = readAll();
    const touchedFileIds: string[] = [];
    for (const entry of entries) {
      const previous = all[entry.id];
      all[entry.id] = {
        fileId: entry.id,
        baselineHash: previous?.baselineHash ?? entry.content_sha256,
        draftHash: previous?.draftHash ?? null,
        serverHash: entry.content_sha256,
        updatedAt: new Date().toISOString(),
      };
      touchedFileIds.push(entry.id);
    }
    writeAll(all);
    window.dispatchEvent(
      new CustomEvent("file-sync-state-change", { detail: { fileIds: touchedFileIds } }),
    );
  },

  markSynced(fileId: string, serverHash: string | null) {
    const all = readAll();
    all[fileId] = {
      fileId,
      baselineHash: serverHash,
      draftHash: serverHash,
      serverHash,
      updatedAt: new Date().toISOString(),
    };
    writeAll(all);
    window.dispatchEvent(new CustomEvent("file-sync-state-change", { detail: { fileId } }));
  },

  clearDraft(fileId: string) {
    const all = readAll();
    const previous = all[fileId];
    if (!previous) return;
    all[fileId] = {
      ...previous,
      draftHash: previous.baselineHash,
      updatedAt: new Date().toISOString(),
    };
    writeAll(all);
    window.dispatchEvent(new CustomEvent("file-sync-state-change", { detail: { fileId } }));
  },

  hasUnsavedChanges(fileId: string): boolean {
    return this.getSyncState(fileId) === "draft";
  },

  hasServerChangedSinceBaseline(fileId: string, remoteHash: string | null): boolean {
    if (!remoteHash) return false;
    const state = this.get(fileId);
    if (!state?.baselineHash) return false;
    return state.baselineHash !== remoteHash;
  },

  isServerChanged(fileId: string, remoteHash: string | null): boolean {
    if (!remoteHash) return false;
    const state = this.get(fileId);
    if (!state?.serverHash) return true;
    return state.serverHash !== remoteHash;
  },

  alignHashes(fileId: string, hash: string | null) {
    const all = readAll();
    all[fileId] = {
      fileId,
      baselineHash: hash,
      draftHash: hash,
      serverHash: hash,
      updatedAt: new Date().toISOString(),
    };
    writeAll(all);
    window.dispatchEvent(new CustomEvent("file-sync-state-change", { detail: { fileId } }));
  },

  getSyncState(fileId: string): SyncState {
    const state = readAll()[fileId];
    if (!state?.draftHash) return "synced";
    return state.draftHash === state.baselineHash ? "synced" : "draft";
  },

  remove(fileId: string) {
    const all = readAll();
    if (!all[fileId]) return;
    delete all[fileId];
    writeAll(all);
    window.dispatchEvent(new CustomEvent("file-sync-state-change", { detail: { fileId } }));
  },
};
