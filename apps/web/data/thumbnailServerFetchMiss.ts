import { isLocalDraftFileId } from "./localDraftFileId";

/**
 * 服务端缩略图 GET 失败登记（按 fileId + content_sha256）。
 * 用于 has_thumbnail 与磁盘不一致时避免重复 404 请求。
 */

const STORAGE_KEY = "excalidraw-thumbnail-server-misses-v1";
const misses = new Map<string, string | null>();
let hydrated = false;

function hydrateMisses(): void {
  if (hydrated || typeof sessionStorage === "undefined") {
    hydrated = true;
    return;
  }
  hydrated = true;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return;
    }
    for (const [fileId, sha] of Object.entries(parsed)) {
      misses.set(fileId, typeof sha === "string" ? sha : null);
    }
  } catch {
    // sessionStorage can be unavailable or contain old invalid payloads.
  }
}

function persistMisses(): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Object.fromEntries(misses)),
    );
  } catch {
    // ignore quota / privacy mode
  }
}

export function isThumbnailServerMiss(
  fileId: string,
  contentSha: string | null | undefined,
): boolean {
  hydrateMisses();
  return misses.get(fileId) === (contentSha ?? null);
}

/** @returns true 表示首次登记该版本，调用方可用以触发 UI 刷新 */
export function markThumbnailServerMiss(
  fileId: string,
  contentSha: string | null | undefined,
): boolean {
  hydrateMisses();
  const sha = contentSha ?? null;
  if (misses.get(fileId) === sha) {
    return false;
  }
  misses.set(fileId, sha);
  persistMisses();
  return true;
}

export function clearThumbnailServerMiss(fileId: string): void {
  hydrateMisses();
  misses.delete(fileId);
  persistMisses();
}

/** 文件列表变更时移除过期或 hash 已变的登记 */
export function pruneThumbnailServerMisses(
  hashByFileId: Record<string, string | null>,
): void {
  hydrateMisses();
  let changed = false;
  for (const [fileId, missedSha] of misses) {
    if (!(fileId in hashByFileId) || hashByFileId[fileId] !== missedSha) {
      misses.delete(fileId);
      changed = true;
    }
  }
  if (changed) {
    persistMisses();
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
