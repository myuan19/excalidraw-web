/** Matches `--nb-filelist-grid-min: 13.75rem` at 16px root. */
export const FILE_LIST_GRID_MIN_PX = 220;

/** Matches `var(--nb-space-8)` horizontal grid gap. */
export const FILE_LIST_GRID_GAP_PX = 32;

/** Horizontal padding on `.filelist__grid` (`space-12` × 2). */
export const FILE_LIST_GRID_HORIZONTAL_PADDING_PX = 96;

/** Body block under thumbnail (name + meta). */
export const FILE_LIST_CARD_BODY_PX = 72;

/** Thumbnail aspect height / width (5:3 width:height → 3/5). */
export const FILE_LIST_THUMB_HEIGHT_RATIO = 3 / 5;

/** Switch to row virtualization above this file count. */
export const FILE_LIST_VIRTUAL_THRESHOLD = 36;

export function computeFileListColumnCount(containerWidth: number): number {
  const inner = Math.max(
    FILE_LIST_GRID_MIN_PX,
    containerWidth - FILE_LIST_GRID_HORIZONTAL_PADDING_PX,
  );
  return Math.max(
    1,
    Math.floor(
      (inner + FILE_LIST_GRID_GAP_PX) /
        (FILE_LIST_GRID_MIN_PX + FILE_LIST_GRID_GAP_PX),
    ),
  );
}

export function estimateFileListRowHeight(columnWidth: number): number {
  const thumbHeight = columnWidth * FILE_LIST_THUMB_HEIGHT_RATIO;
  return thumbHeight + FILE_LIST_CARD_BODY_PX + FILE_LIST_GRID_GAP_PX;
}

export function computeFileListColumnWidth(
  containerWidth: number,
  columnCount: number,
): number {
  const inner = Math.max(
    FILE_LIST_GRID_MIN_PX,
    containerWidth - FILE_LIST_GRID_HORIZONTAL_PADDING_PX,
  );
  if (columnCount <= 1) {
    return inner;
  }
  return (
    (inner - FILE_LIST_GRID_GAP_PX * (columnCount - 1)) / columnCount
  );
}
