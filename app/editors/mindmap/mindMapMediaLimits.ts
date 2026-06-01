import {
  EDITOR_MAX_IMAGE_DIMENSION,
  EDITOR_MAX_IMAGE_FILE_BYTES,
} from "@excalidraw/common";

/** Apply shared image caps to MindMap runtime config (host bridge → iframe). */
export function applyMindMapMediaLimitsToConfig(
  config: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...config,
    maxNodeImageStorageBytes: EDITOR_MAX_IMAGE_FILE_BYTES,
    maxNodeImageStorageWidth: EDITOR_MAX_IMAGE_DIMENSION,
    maxNodeImageStorageHeight: EDITOR_MAX_IMAGE_DIMENSION,
  };
}
