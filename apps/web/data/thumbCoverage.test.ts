import { describe, expect, it } from "vitest";

import {
  THUMB_PREFETCH_FIRST_N,
  THUMB_PREFETCH_RECENT_ALL,
  computeThumbFetchAllowIds,
} from "./thumbCoverage";

describe("thumbCoverage", () => {
  it("prefetches all scope files when recent view uses THUMB_PREFETCH_RECENT_ALL", () => {
    const scope = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const allow = computeThumbFetchAllowIds(
      new Set(),
      scope,
      THUMB_PREFETCH_RECENT_ALL,
    );
    expect(allow.size).toBe(3);
    expect(THUMB_PREFETCH_FIRST_N).toBe(16);
  });
});
