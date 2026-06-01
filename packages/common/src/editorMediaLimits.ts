/** Canonical caps — also mirrored in ../editor-media-limits.cjs for MindMap build-time require(). */
export const EDITOR_MEDIA_LIMITS = {
  maxFileBytes: 8 * 1024 * 1024,
  maxDimension: 8192,
} as const;

export const EDITOR_MAX_IMAGE_FILE_BYTES = EDITOR_MEDIA_LIMITS.maxFileBytes;
export const EDITOR_MAX_IMAGE_DIMENSION = EDITOR_MEDIA_LIMITS.maxDimension;

export function formatEditorMaxImageFileSizeMb(): string {
  return `${Math.trunc(EDITOR_MAX_IMAGE_FILE_BYTES / 1024 / 1024)}MB`;
}
