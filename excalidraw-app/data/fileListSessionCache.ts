import type { FileTreeResponse, ServerFile } from "./ServerSync";

const CACHE_KEY = "excalidraw-filelist-tree-v1";

/** 去掉可能很大的字段，避免撑满 sessionStorage */
function stripFilesForCache(files: ServerFile[]): ServerFile[] {
  return files.map((f) => {
    const { data: _d, thumbnail_svg: _t, ...rest } = f;
    return rest;
  });
}

export function readFileListTreeCache(): FileTreeResponse | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as FileTreeResponse;
    if (
      !parsed ||
      !Array.isArray(parsed.folders) ||
      !Array.isArray(parsed.files)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeFileListTreeCache(tree: FileTreeResponse): void {
  try {
    const payload: FileTreeResponse = {
      folders: tree.folders,
      files: stripFilesForCache(tree.files),
    };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // 配额或隐私模式：忽略
  }
}

export function hasFileListTreeCache(): boolean {
  try {
    return sessionStorage.getItem(CACHE_KEY) != null;
  } catch {
    return false;
  }
}
