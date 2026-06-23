const ALL_FILES_TREE_EXPANDED_KEY = "excalidraw-filelist-all-files-tree-expanded";
const EXPANDED_FOLDERS_KEY = "excalidraw-filelist-expanded-folders";

export function readAllFilesTreeExpanded(defaultExpanded = true): boolean {
  try {
    const saved = localStorage.getItem(ALL_FILES_TREE_EXPANDED_KEY);
    if (saved === "0") {
      return false;
    }
    if (saved === "1") {
      return true;
    }
  } catch {
    /* ignore */
  }
  return defaultExpanded;
}

export function writeAllFilesTreeExpanded(expanded: boolean): void {
  try {
    localStorage.setItem(ALL_FILES_TREE_EXPANDED_KEY, expanded ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function readExpandedFolders(): Record<string, boolean> {
  try {
    const saved = localStorage.getItem(EXPANDED_FOLDERS_KEY);
    if (!saved) {
      return {};
    }
    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const result: Record<string, boolean> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === "boolean") {
        result[id] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function writeExpandedFolders(state: Record<string, boolean>): void {
  try {
    localStorage.setItem(EXPANDED_FOLDERS_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}
