import { LocalThumbnailCache } from "./localThumbnailCache";

/** Post-save: bind the thumbnail that was just uploaded to the saved content hash. */
export function bindSavedFileThumbnailToContentSha(
  fileId: string,
  contentSha: string | null | undefined,
  svg?: string | null,
): string | null {
  return LocalThumbnailCache.bindToContentSha(fileId, contentSha, svg);
}

/** Draft editing: cache preview keyed to current draft/scene hash. */
export function cacheDraftFileThumbnail(
  fileId: string,
  svg: string,
  sceneHash: string | null | undefined,
): void {
  LocalThumbnailCache.setDraftPreview(fileId, svg, sceneHash);
}
