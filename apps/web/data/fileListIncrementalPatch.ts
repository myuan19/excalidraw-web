import {
  readFileListTreeCache,
  writeFileListTreeCacheEtag,
} from "./fileListSessionCache";
import type { ServerFile } from "./ServerSync";

export type FileListIncrementalPatch = Partial<
  Pick<
    ServerFile,
    | "name"
    | "kind"
    | "has_thumbnail"
    | "content_sha256"
    | "version"
    | "updated_at"
  >
>;

export function readFileListIncrementalPatch(
  fileId: string,
): FileListIncrementalPatch | null {
  const tree = readFileListTreeCache();
  if (!tree) {
    return null;
  }
  const file = tree.files.find((item) => item.id === fileId);
  if (!file) {
    return null;
  }
  return {
    name: file.name,
    kind: file.kind,
    has_thumbnail: file.has_thumbnail,
    content_sha256: file.content_sha256,
    version: file.version,
    updated_at: file.updated_at,
  };
}

export function mergeServerFilePatch(
  file: ServerFile,
  patch: FileListIncrementalPatch,
): ServerFile {
  return { ...file, ...patch };
}

/** 单文件元数据变更后使 tree etag 失效，避免 304 掩盖 listing 变化。 */
export function invalidateFileListTreeCacheEtag(): void {
  writeFileListTreeCacheEtag(null);
}

export const FILE_LIST_INCREMENTAL_APPLY_EVENT =
  "excalidraw-file-list-incremental-apply";

/** finalizeSavedThumbnail 等就地 patch 缓存后，通知列表合并最新元数据。 */
export function dispatchFileListIncrementalApply(fileId: string): void {
  window.dispatchEvent(
    new CustomEvent(FILE_LIST_INCREMENTAL_APPLY_EVENT, {
      detail: { fileId },
    }),
  );
}
