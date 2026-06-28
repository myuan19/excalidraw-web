import { describe, expect, it } from "vitest";

import {
  computeFileListGridListedCellCount,
  FILE_LIST_LARGE_DOM_THRESHOLD,
} from "./fileListGridLayout";

describe("fileListGridLayout", () => {
  it("counts listed cells with optional leading slot", () => {
    expect(computeFileListGridListedCellCount(5, false)).toBe(5);
    expect(computeFileListGridListedCellCount(5, true)).toBe(6);
  });

  it("exports a large-list diagnostic threshold", () => {
    expect(FILE_LIST_LARGE_DOM_THRESHOLD).toBeGreaterThan(0);
  });
});
