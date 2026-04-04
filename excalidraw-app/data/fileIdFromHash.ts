export function getFileIdFromHash(): string | null {
  const match = window.location.hash.match(/^#file=(.+)$/);
  return match ? match[1] : null;
}

export function getFileIdFromHashString(hash: string): string | null {
  const match = hash.match(/^#file=(.+)$/);
  return match ? match[1] : null;
}

export function getFileIdFromUrl(url: string): string | null {
  try {
    return getFileIdFromHashString(new URL(url).hash);
  } catch {
    return null;
  }
}
