const STORAGE_PREFIX = "excalidraw-embed-doc:";

type EmbedDocCacheEntry = {
  etag: string;
  payload: { data: unknown };
};

function storageKey(fileId: string): string {
  return `${STORAGE_PREFIX}${fileId}`;
}

export function getEmbedDocumentCache(
  fileId: string,
): EmbedDocCacheEntry | null {
  try {
    const raw = sessionStorage.getItem(storageKey(fileId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as EmbedDocCacheEntry;
    if (!parsed?.etag || !parsed?.payload) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setEmbedDocumentCache(
  fileId: string,
  etag: string,
  payload: { data: unknown },
): void {
  try {
    sessionStorage.setItem(
      storageKey(fileId),
      JSON.stringify({ etag, payload } satisfies EmbedDocCacheEntry),
    );
  } catch {
    // quota / private mode
  }
}

export function formatIfNoneMatchHeader(sha256: string): string {
  const trimmed = sha256.trim();
  return trimmed.startsWith('"') ? trimmed : `"${trimmed}"`;
}
