import { FileSyncState } from "./FileSyncState";

import type { ArchiveEntry } from "./ServerSync";

/** 当前编辑内容哈希（优先草稿哈希，否则服务器基线）。 */
export function readCurrentFileContentHash(fileId: string): string | null {
  return (
    FileSyncState.getDraftHash(fileId) ??
    FileSyncState.getBaselineHash(fileId) ??
    null
  );
}

/** 当前内容是否已存在于已归档版本列表中（按 content_sha256 比对）。 */
export function isContentHashArchived(
  archives: ArchiveEntry[],
  contentHash: string | null | undefined,
): boolean {
  if (!contentHash) {
    return false;
  }
  return archives.some((archive) => archive.content_sha256 === contentHash);
}
