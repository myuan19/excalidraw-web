export function getFileIdFromLocation(location: Location = window.location): string | null {
  const searchId = new URLSearchParams(location.search).get("file");
  if (searchId?.trim()) return searchId.trim();

  const rawHash = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  if (!rawHash) return null;

  const hashParams = new URLSearchParams(rawHash);
  const hashParamId = hashParams.get("file");
  if (hashParamId?.trim()) return hashParamId.trim();

  const legacyMatch = location.hash.match(/^#file=(.+)$/);
  return legacyMatch?.[1]?.trim() ?? null;
}

export function buildFileDeepLink(
  fileId: string,
  kind?: string,
  base = typeof window !== "undefined"
    ? `${window.location.origin}${window.location.pathname}`
    : "http://localhost/",
): string {
  const url = new URL(base);
  url.searchParams.set("file", fileId);
  if (kind) url.searchParams.set("kind", kind);
  return `${url.pathname}${url.search}`;
}

export function syncFileDeepLink(fileId: string | null, kind?: string) {
  const url = new URL(window.location.href);
  if (fileId) {
    url.searchParams.set("file", fileId);
    if (kind) url.searchParams.set("kind", kind);
    url.hash = `file=${fileId}`;
  } else {
    url.searchParams.delete("file");
    url.searchParams.delete("kind");
    url.hash = "";
  }
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}
