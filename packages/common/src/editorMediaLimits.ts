import limits from "../editor-media-limits.cjs";

/** @see ../editor-media-limits.cjs — do not duplicate byte caps elsewhere */
export const EDITOR_MEDIA_LIMITS = {
  maxFileBytes: limits.maxFileBytes as number,
  maxDimension: limits.maxDimension as number,
} as const;

export const EDITOR_MAX_IMAGE_FILE_BYTES = EDITOR_MEDIA_LIMITS.maxFileBytes;
export const EDITOR_MAX_IMAGE_DIMENSION = EDITOR_MEDIA_LIMITS.maxDimension;

export function formatEditorMaxImageFileSizeMb(): string {
  return `${Math.trunc(EDITOR_MAX_IMAGE_FILE_BYTES / 1024 / 1024)}MB`;
}
