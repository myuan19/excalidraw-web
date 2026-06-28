/** Count grid cells including optional leading slot (e.g. “新建” card). */
export function computeFileListGridListedCellCount(
  fileCount: number,
  hasLeadingSlot: boolean,
): number {
  return fileCount + (hasLeadingSlot ? 1 : 0);
}

/** Large list threshold used by scroll perf diagnostics. */
export const FILE_LIST_LARGE_DOM_THRESHOLD = 36;
