const pendingIds = new Set<string>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeNativeThumbnailPending(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isNativeThumbnailPending(fileId: string): boolean {
  return pendingIds.has(fileId);
}

export function markNativeThumbnailPending(fileIds: Iterable<string>): void {
  let changed = false;
  for (const fileId of fileIds) {
    if (!pendingIds.has(fileId)) {
      pendingIds.add(fileId);
      changed = true;
    }
  }
  if (changed) {
    notify();
  }
}

export function clearNativeThumbnailPending(fileIds: Iterable<string>): void {
  let changed = false;
  for (const fileId of fileIds) {
    if (pendingIds.delete(fileId)) {
      changed = true;
    }
  }
  if (changed) {
    notify();
  }
}
