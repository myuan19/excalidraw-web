import type { FileTreeResponse, ServerFile } from "./ServerSync";

const CACHE_KEY = "excalidraw-filelist-tree-v1";

/** 去掉可能很大的字段，避免撑满 sessionStorage */
function stripFilesForCache(files: ServerFile[]): ServerFile[] {
  return files.map((f) => {
    const { data: _d, ...rest } = f;
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

/** 根节点改名等场景下就地更新列表缓存中的显示名，避免下次打开仍读到「未命名」。 */
export function patchFileListTreeCacheFileName(
  fileId: string,
  name: string,
): void {
  const tree = readFileListTreeCache();
  if (!tree) {
    return;
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return;
  }
  const index = tree.files.findIndex((file) => file.id === fileId);
  if (index === -1) {
    return;
  }
  if (tree.files[index].name === trimmed) {
    return;
  }
  const nextFiles = [...tree.files];
  nextFiles[index] = { ...nextFiles[index], name: trimmed };
  writeFileListTreeCache({ folders: tree.folders, files: nextFiles });
}

export function patchFileListTreeCacheSavedFile(
  fileId: string,
  patch: Pick<ServerFile, "name"> &
    Partial<
      Pick<
        ServerFile,
        "content_sha256" | "has_thumbnail" | "kind" | "updated_at"
      >
    >,
): void {
  const tree = readFileListTreeCache();
  if (!tree) {
    return;
  }
  const index = tree.files.findIndex((file) => file.id === fileId);
  if (index === -1) {
    return;
  }
  const file = tree.files[index];
  const nextFiles = [...tree.files];
  nextFiles[index] = {
    ...file,
    name: patch.name.trim() || file.name,
    kind: patch.kind ?? file.kind,
    has_thumbnail: patch.has_thumbnail ?? file.has_thumbnail,
    content_sha256: patch.content_sha256 ?? file.content_sha256 ?? null,
    updated_at: patch.updated_at ?? file.updated_at,
  };
  writeFileListTreeCache({ folders: tree.folders, files: nextFiles });
}

/**
 * 缩略图 404 后修正本 tab 的列表缓存，避免首页再次用旧 has_thumbnail
 * 乐观拉取同一版本的缺失缩略图。
 */
export function patchFileListTreeCacheThumbnailMissing(
  fileId: string,
  contentSha: string | null | undefined,
): boolean {
  const tree = readFileListTreeCache();
  if (!tree) {
    return false;
  }
  const index = tree.files.findIndex((file) => file.id === fileId);
  if (index === -1) {
    return false;
  }
  const file = tree.files[index];
  if (
    !file.has_thumbnail ||
    (file.content_sha256 ?? null) !== (contentSha ?? null)
  ) {
    return false;
  }
  const nextFiles = [...tree.files];
  nextFiles[index] = { ...file, has_thumbnail: false };
  writeFileListTreeCache({ folders: tree.folders, files: nextFiles });
  return true;
}
