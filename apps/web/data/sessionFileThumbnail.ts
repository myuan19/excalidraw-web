import { LocalThumbnailCache } from "./localThumbnailCache";

const pendingSavedThumbnailByFile = new Map<string, string>();

/** Post-save: bind the thumbnail that was just uploaded (same contract as MindMap). */
export function bindSavedFileThumbnailToContentSha(
  fileId: string,
  contentSha: string | null | undefined,
  svg?: string | null,
): string | null {
  if (contentSha && svg) {
    clearPendingSavedFileThumbnail(fileId, contentSha);
  }
  return LocalThumbnailCache.bindToContentSha(fileId, contentSha, svg);
}

export function markPendingSavedFileThumbnail(
  fileId: string,
  contentSha: string | null | undefined,
): void {
  if (!contentSha) {
    pendingSavedThumbnailByFile.delete(fileId);
    return;
  }
  pendingSavedThumbnailByFile.set(fileId, contentSha);
}

export function clearPendingSavedFileThumbnail(
  fileId: string,
  contentSha?: string | null,
): void {
  if (!contentSha || pendingSavedThumbnailByFile.get(fileId) === contentSha) {
    pendingSavedThumbnailByFile.delete(fileId);
  }
}

export function hasPendingSavedFileThumbnail(
  fileId: string,
  contentSha: string | null | undefined,
): boolean {
  return !!contentSha && pendingSavedThumbnailByFile.get(fileId) === contentSha;
}

export function getPendingSavedFileThumbnailContentSha(
  fileId: string,
): string | null {
  return pendingSavedThumbnailByFile.get(fileId) ?? null;
}

/** Draft editing: cache preview keyed to current draft/scene hash. */
export function cacheDraftFileThumbnail(
  fileId: string,
  svg: string,
  sceneHash: string | null | undefined,
): void {
  LocalThumbnailCache.setDraftPreview(fileId, svg, sceneHash);
}
