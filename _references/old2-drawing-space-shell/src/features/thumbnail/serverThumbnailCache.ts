const cache = new Map<string, string>();

function cacheKey(fileId: string, contentSha: string | null | undefined) {
  return `${fileId}:${contentSha ?? "no-hash"}`;
}

export const ServerThumbnailCache = {
  get(fileId: string, contentSha?: string | null): string | null {
    return cache.get(cacheKey(fileId, contentSha)) ?? null;
  },

  set(fileId: string, contentSha: string | null | undefined, svg: string | null) {
    if (!svg) return;
    cache.set(cacheKey(fileId, contentSha), svg);
  },

  clear(fileId: string) {
    for (const key of cache.keys()) {
      if (key.startsWith(`${fileId}:`)) {
        cache.delete(key);
      }
    }
  },
};
