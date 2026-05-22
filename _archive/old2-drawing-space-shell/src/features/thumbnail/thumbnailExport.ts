export const FILE_LIST_THUMB_EXPORT_PADDING = 8;
export const FILE_LIST_THUMB_DISPLAY_ASPECT = 5 / 3;
export const FILE_LIST_THUMB_MIN_VIEWPORT_WIDTH = 240;
export const FILE_LIST_THUMB_MIN_VIEWPORT_HEIGHT =
  FILE_LIST_THUMB_MIN_VIEWPORT_WIDTH / FILE_LIST_THUMB_DISPLAY_ASPECT;

export function appStateForThumbnailExport(
  appState: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...appState,
    exportBackground: true,
  };
}
