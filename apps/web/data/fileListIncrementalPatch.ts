import {
  readFileListTreeCache,
} from "./fileListSessionCache";
import type { FileTreeResponse, ServerFile } from "./ServerSync";

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

function parseSortTimestamp(value: string | null | undefined): number {
  if (!value) {
    return Number.NaN;
  }
  return Date.parse(value);
}

function shouldPreferSessionCachePatch(
  file: ServerFile,
  patch: FileListIncrementalPatch,
): boolean {
  if (
    patch.content_sha256 &&
    patch.content_sha256 !== (file.content_sha256 ?? null)
  ) {
    return true;
  }
  if (
    typeof patch.version === "number" &&
    (file.version ?? 0) < patch.version
  ) {
    return true;
  }
  if (patch.updated_at) {
    const patchMs = parseSortTimestamp(patch.updated_at);
    const fileMs = parseSortTimestamp(file.updated_at);
    if (
      Number.isFinite(patchMs) &&
      (!Number.isFinite(fileMs) || patchMs > fileMs)
    ) {
      return true;
    }
  }
  if (patch.has_thumbnail === true && !file.has_thumbnail) {
    return true;
  }
  return false;
}

/** 列表按更新时间排序：取 server / 本地编辑 / session 增量 patch 中最新的时间。 */
export function resolveListSortUpdatedAt(
  fileId: string,
  serverUpdatedAt: string,
  localEditTime: string | null | undefined,
): string {
  const patchUpdatedAt = readFileListIncrementalPatch(fileId)?.updated_at;
  let best = serverUpdatedAt;
  let bestMs = parseSortTimestamp(serverUpdatedAt);
  for (const candidate of [localEditTime, patchUpdatedAt]) {
    if (!candidate) {
      continue;
    }
    const candidateMs = parseSortTimestamp(candidate);
    if (!Number.isFinite(candidateMs)) {
      continue;
    }
    if (!Number.isFinite(bestMs) || candidateMs > bestMs) {
      best = candidate;
      bestMs = candidateMs;
    }
  }
  return best;
}

/** 合并 finalizeSavedThumbnail 写入 session 的元数据，避免 catalog 刷新回退 content_sha。 */
export function mergeFileListTreeWithSessionCachePatches(
  tree: FileTreeResponse,
): FileTreeResponse {
  const files = tree.files.map((file) => {
    const patch = readFileListIncrementalPatch(file.id);
    if (!patch || !shouldPreferSessionCachePatch(file, patch)) {
      return file;
    }
    return mergeServerFilePatch(file, patch);
  });
  return { ...tree, files };
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
