import { create } from "zustand";
import { ServerSync } from "@/services/ServerSync";
import type { FileOrderItem, ServerFile, ServerFolder, SortBy, SortDir } from "@/types/file";

interface FileState {
  files: ServerFile[];
  folders: ServerFolder[];
  currentFolderId: string | null;
  expandedFolders: Record<string, boolean>;
  searchQuery: string;
  sortBy: SortBy;
  sortDir: SortDir;
  loading: boolean;
  error: string | null;

  loadFileTree(): Promise<void>;
  setFiles(files: ServerFile[]): void;
  setFolders(folders: ServerFolder[]): void;
  setCurrentFolder(folderId: string | null): void;
  toggleFolder(folderId: string): void;
  setExpandedFolder(folderId: string, expanded: boolean): void;
  setSearchQuery(query: string): void;
  setSortBy(sortBy: SortBy): void;
  setSortDir(dir: SortDir): void;

  createFile(name: string, kind: string): Promise<ServerFile>;
  removeFile(id: string): Promise<void>;
  renameFile(id: string, name: string): Promise<void>;
  moveFile(id: string, folderId: string | null): Promise<void>;
  updateFile(id: string, updates: Partial<ServerFile>): void;

  createFolder(name: string, parentId: string | null): Promise<ServerFolder>;
  removeFolder(id: string): Promise<void>;
  renameFolder(id: string, name: string): Promise<void>;
  updateFolder(id: string, updates: Partial<ServerFolder>): void;
  reorderFolders(parentId: string | null, orderedIds: string[]): Promise<void>;
  moveFolderTo(folderId: string, newParentId: string | null, insertIndex: number): Promise<void>;
}

function getStoredSort(): { sortBy: SortBy; sortDir: SortDir } {
  try {
    const raw = localStorage.getItem("excalidraw-filelist-sort");
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { sortBy: "updatedAt", sortDir: "desc" };
}

function getStoredFolder(): string | null {
  try {
    return sessionStorage.getItem("excalidraw-filelist-folder") || null;
  } catch { return null; }
}

const stored = getStoredSort();
const FILE_TREE_CACHE_KEY = "excalidraw-filelist-tree-cache";

function getCachedTree(): Pick<FileState, "files" | "folders"> {
  try {
    const raw = sessionStorage.getItem(FILE_TREE_CACHE_KEY);
    if (!raw) return { files: [], folders: [] };
    const parsed = JSON.parse(raw) as { files?: ServerFile[]; folders?: ServerFolder[] };
    return {
      files: Array.isArray(parsed.files) ? parsed.files : [],
      folders: Array.isArray(parsed.folders) ? parsed.folders : [],
    };
  } catch {
    return { files: [], folders: [] };
  }
}

function cacheTree(files: ServerFile[], folders: ServerFolder[]) {
  try {
    sessionStorage.setItem(FILE_TREE_CACHE_KEY, JSON.stringify({ files, folders }));
  } catch {
    // Session cache is a best-effort first-paint optimization.
  }
}

const cachedTree = getCachedTree();

export const useFileStore = create<FileState>((set, get) => ({
  files: cachedTree.files,
  folders: cachedTree.folders,
  currentFolderId: getStoredFolder(),
  expandedFolders: {},
  searchQuery: "",
  sortBy: stored.sortBy,
  sortDir: stored.sortDir,
  loading: false,
  error: null,

  async loadFileTree() {
    set({ loading: true, error: null });
    try {
      const tree = await ServerSync.listFileTree();
      const expandedFolders = { ...get().expandedFolders };
      for (const folder of tree.folders) {
        if (!(folder.id in expandedFolders)) {
          expandedFolders[folder.id] = true;
        }
      }
      cacheTree(tree.files, tree.folders);
      set({ files: tree.files, folders: tree.folders, expandedFolders, loading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), loading: false });
    }
  },

  setFiles(files) { set({ files }); },
  setFolders(folders) { set({ folders }); },

  setCurrentFolder(folderId) {
    sessionStorage.setItem("excalidraw-filelist-folder", folderId ?? "");
    set({ currentFolderId: folderId });
  },

  toggleFolder(folderId) {
    set((s) => ({
      expandedFolders: { ...s.expandedFolders, [folderId]: !s.expandedFolders[folderId] },
    }));
  },

  setExpandedFolder(folderId, expanded) {
    set((s) => ({
      expandedFolders: { ...s.expandedFolders, [folderId]: expanded },
    }));
  },

  setSearchQuery(query) { set({ searchQuery: query }); },

  setSortBy(sortBy) {
    const sortDir = get().sortDir;
    set({ sortBy });
    localStorage.setItem("excalidraw-filelist-sort", JSON.stringify({ sortBy, sortDir }));
  },

  setSortDir(dir) {
    set({ sortDir: dir });
    localStorage.setItem(
      "excalidraw-filelist-sort",
      JSON.stringify({ sortBy: get().sortBy, sortDir: dir }),
    );
  },

  async createFile(name, kind) {
    const file = await ServerSync.createFile(name, kind, get().currentFolderId);
    set((s) => {
      const files = [file, ...s.files];
      cacheTree(files, s.folders);
      return { files };
    });
    return file;
  },
  async removeFile(id) {
    await ServerSync.deleteFile(id);
    set((s) => {
      const files = s.files.filter((f) => f.id !== id);
      cacheTree(files, s.folders);
      return { files };
    });
  },
  async renameFile(id, name) {
    const file = await ServerSync.renameFile(id, name);
    set((s) => {
      const files = s.files.map((f) => (f.id === id ? { ...f, ...file } : f));
      cacheTree(files, s.folders);
      return { files };
    });
  },
  async moveFile(id, folderId) {
    await ServerSync.moveFiles([id], folderId);
    set((s) => {
      const files = s.files.map((f) =>
        f.id === id ? { ...f, folder_id: folderId, updated_at: new Date().toISOString() } : f,
      );
      cacheTree(files, s.folders);
      return { files };
    });
  },
  updateFile(id, updates) {
    set((s) => {
      const files = s.files.map((f) => (f.id === id ? { ...f, ...updates } : f));
      cacheTree(files, s.folders);
      return { files };
    });
  },

  async createFolder(name, parentId) {
    const folder = await ServerSync.createFolder(name, parentId);
    set((s) => {
      const folders = [...s.folders, folder];
      cacheTree(s.files, folders);
      return {
        folders,
        expandedFolders: { ...s.expandedFolders, [folder.id]: true },
      };
    });
    return folder;
  },
  async removeFolder(id) {
    await ServerSync.deleteFolder(id);
    set((s) => {
      const folders = s.folders.filter((f) => f.id !== id);
      const files = s.files.map((f) => (f.folder_id === id ? { ...f, folder_id: null } : f));
      cacheTree(files, folders);
      return { folders, files };
    });
  },
  async renameFolder(id, name) {
    const folder = await ServerSync.renameFolder(id, name);
    set((s) => {
      const folders = s.folders.map((f) => (f.id === id ? { ...f, ...folder } : f));
      cacheTree(s.files, folders);
      return { folders };
    });
  },
  updateFolder(id, updates) {
    set((s) => {
      const folders = s.folders.map((f) => (f.id === id ? { ...f, ...updates } : f));
      cacheTree(s.files, folders);
      return { folders };
    });
  },

  async reorderFolders(parentId, orderedIds) {
    const items: FileOrderItem[] = orderedIds.map((id) => ({ type: "folder", id }));
    await ServerSync.saveOrder(parentId, items);
    set((s) => {
      const folders = s.folders.map((f) => {
        if (f.parent_id !== parentId) return f;
        const idx = orderedIds.indexOf(f.id);
        return idx >= 0 ? { ...f, sort_index: idx } : f;
      });
      cacheTree(s.files, folders);
      return { folders };
    });
  },

  async moveFolderTo(folderId, newParentId, insertIndex) {
    const siblingsForOrder = get().folders
      .filter((f) => f.parent_id === newParentId && f.id !== folderId)
      .sort((a, b) => a.sort_index - b.sort_index)
      .map((f) => f.id);
    siblingsForOrder.splice(insertIndex, 0, folderId);
    await ServerSync.saveOrder(
      newParentId,
      siblingsForOrder.map((id) => ({ type: "folder", id })),
    );
    set((s) => {
      const folder = s.folders.find((f) => f.id === folderId);
      if (!folder) return s;

      const siblings = s.folders
        .filter((f) => f.parent_id === newParentId && f.id !== folderId)
        .sort((a, b) => a.sort_index - b.sort_index);

      siblings.splice(insertIndex, 0, { ...folder, parent_id: newParentId, sort_index: insertIndex });

      const updated = new Map<string, Partial<ServerFolder>>();
      siblings.forEach((f, i) => updated.set(f.id, { parent_id: newParentId, sort_index: i }));

      const folders = s.folders.map((f) => {
        const u = updated.get(f.id);
        return u ? { ...f, ...u } : f;
      });
      cacheTree(s.files, folders);
      return { folders };
    });
  },
}));

export function getDescendantFolderIds(folders: ServerFolder[], rootId: string): Set<string> {
  const result = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const f of folders) {
      if (f.parent_id === current && !result.has(f.id)) {
        result.add(f.id);
        queue.push(f.id);
      }
    }
  }
  return result;
}
