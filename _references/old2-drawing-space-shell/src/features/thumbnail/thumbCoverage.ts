import type { ServerFile } from "@/types/file";

const DEFAULT_PREFETCH_LIMIT = 16;

export function getThumbnailPrefetchScope(
  files: readonly ServerFile[],
  limit = DEFAULT_PREFETCH_LIMIT,
): ServerFile[] {
  return files
    .filter((file) => file.has_thumbnail)
    .slice(0, limit);
}
