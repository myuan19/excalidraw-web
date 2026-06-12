import { describe, expect, it } from "vitest";

import {
  clearTabFileDirty,
  isTabFileDirty,
  markTabFileDirty,
} from "./tabFileDirtyState";

describe("tabFileDirtyState", () => {
  it("marks and clears per file id", () => {
    expect(isTabFileDirty("file-1")).toBe(false);
    markTabFileDirty("file-1");
    expect(isTabFileDirty("file-1")).toBe(true);
    expect(isTabFileDirty("file-2")).toBe(false);
    clearTabFileDirty("file-1");
    expect(isTabFileDirty("file-1")).toBe(false);
  });

  it("treats missing file ids as clean", () => {
    expect(isTabFileDirty(null)).toBe(false);
    expect(isTabFileDirty(undefined)).toBe(false);
  });
});
