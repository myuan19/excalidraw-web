import { isLocalDraftFileId } from "./localDraftFileId";

/**
 * 服务端缩略图 GET 失败登记（按 fileId + content_sha256）。
 * 用于 has_thumbnail 与磁盘不一致时避免重复 404 请求。
 */

const misses = new Map<string, string | null>();

export function isThumbnailServerMiss(
  fileId: string,
  contentSha: string | null | undefined,
): boolean {
  return misses.get(fileId) === (contentSha ?? null);
}

/** @returns true 表示首次登记该版本，调用方可用以触发 UI 刷新 */
export function markThumbnailServerMiss(
  fileId: string,
  contentSha: string | null | undefined,
): boolean {
  const sha = contentSha ?? null;
  if (misses.get(fileId) === sha) {
    return false;
  }
  misses.set(fileId, sha);
  return true;
}

export function clearThumbnailServerMiss(fileId: string): void {
  misses.delete(fileId);
}

/** 文件列表变更时移除过期或 hash 已变的登记 */
export function pruneThumbnailServerMisses(
  hashByFileId: Record<string, string | null>,
): void {
  for (const [fileId, missedSha] of misses) {
    if (!(fileId in hashByFileId) || hashByFileId[fileId] !== missedSha) {
      misses.delete(fileId);
    }
  }
}

export function shouldFetchServerThumbnail(
  fileId: string,
  file: { has_thumbnail?: boolean; content_sha256?: string | null },
): boolean {
  if (!file.has_thumbnail || isLocalDraftFileId(fileId)) {
    return false;
  }
  return !isThumbnailServerMiss(fileId, file.content_sha256);
}
