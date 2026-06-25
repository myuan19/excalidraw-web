import { traceThumb, id8 } from "../lib/interactionDebugTrace";

const pendingIds = new Set<string>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeThumbnailSavePending(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isThumbnailSavePending(fileId: string): boolean {
  return pendingIds.has(fileId);
}

export function markThumbnailSavePending(fileIds: Iterable<string>): void {
  let changed = false;
  const marked: string[] = [];
  for (const fileId of fileIds) {
    if (!pendingIds.has(fileId)) {
      pendingIds.add(fileId);
      marked.push(fileId);
      changed = true;
    }
  }
  if (changed) {
    traceThumb("savePending.mark", {
      fileIds8: marked.map((id) => id8(id)),
      pendingCount: pendingIds.size,
    });
    notify();
  }
}

export function clearThumbnailSavePending(fileIds: Iterable<string>): void {
  let changed = false;
  const cleared: string[] = [];
  for (const fileId of fileIds) {
    if (pendingIds.delete(fileId)) {
      cleared.push(fileId);
      changed = true;
    }
  }
  if (changed) {
    traceThumb("savePending.clear", {
      fileIds8: cleared.map((id) => id8(id)),
      pendingCount: pendingIds.size,
    });
    notify();
  }
}
