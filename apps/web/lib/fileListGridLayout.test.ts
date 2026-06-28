import { describe, expect, it } from "vitest";

import {
  computeFileListColumnCount,
  computeFileListColumnWidth,
  estimateFileListRowHeight,
  FILE_LIST_GRID_HORIZONTAL_PADDING_PX,
  FILE_LIST_GRID_MIN_PX,
} from "./fileListGridLayout";

describe("fileListGridLayout", () => {
  it("computes responsive column counts for common widths", () => {
    expect(computeFileListColumnCount(960)).toBe(3);
    expect(computeFileListColumnCount(400)).toBe(1);
    expect(computeFileListColumnCount(1400)).toBe(5);
  });

  it("estimates row height from column width", () => {
    const columnWidth = computeFileListColumnWidth(960, 3);
    const rowHeight = estimateFileListRowHeight(columnWidth);
    expect(rowHeight).toBeGreaterThan(FILE_LIST_GRID_MIN_PX);
  });

  it("accounts for horizontal padding when sizing columns", () => {
    const width = 960;
    const columns = computeFileListColumnCount(width);
    const columnWidth = computeFileListColumnWidth(width, columns);
    const total =
      columnWidth * columns +
      32 * Math.max(0, columns - 1) +
      FILE_LIST_GRID_HORIZONTAL_PADDING_PX;
    expect(total).toBeLessThanOrEqual(width + 1);
  });
});
