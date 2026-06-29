import { sanitizeFileIdFromHashValue } from "./libraryImportHash";

export function getFileIdFromHash(): string | null {
  return getFileIdFromHashString(window.location.hash);
}

export function getFileIdFromHashString(hash: string): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw.split("#")[0] ?? raw);
  const id = params.get("file");
  if (id) {
    return sanitizeFileIdFromHashValue(id);
  }
  const match = hash.match(/^#file=([^&#]+)/);
  return match ? match[1] : null;
}

export function getFileIdFromUrl(url: string): string | null {
  try {
    return getFileIdFromHashString(new URL(url).hash);
  } catch {
    return null;
  }
}
