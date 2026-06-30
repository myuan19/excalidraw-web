import { describe, expect, it } from "vitest";

import {
  THUMB_VISIBILITY_ROOT_MARGIN_PX,
  computeThumbFetchAllowIds,
  measureVisibleThumbIdsInRoot,
} from "./thumbCoverage";

describe("thumbCoverage", () => {
  it("uses only visible ids for fetch allow set (no list prefetch)", () => {
    const visible = new Set(["a", "b"]);
    const allow = computeThumbFetchAllowIds(visible);
    expect(allow.size).toBe(2);
    expect([...allow]).toEqual(["a", "b"]);
  });

  it("measures visible thumb nodes within root margin", () => {
    const root = {
      getBoundingClientRect: () => ({
        top: 100,
        left: 0,
        right: 800,
        bottom: 900,
      }),
    } as HTMLElement;

    const nodes = new Map<string, HTMLElement>([
      [
        "visible",
        {
          getBoundingClientRect: () => ({
            top: 120,
            left: 10,
            right: 210,
            bottom: 320,
          }),
        } as HTMLElement,
      ],
      [
        "far-below",
        {
          getBoundingClientRect: () => ({
            top: 2000,
            left: 10,
            right: 210,
            bottom: 2200,
          }),
        } as HTMLElement,
      ],
      [
        "nearby",
        {
          getBoundingClientRect: () => ({
            top: 920,
            left: 10,
            right: 210,
            bottom: 1120,
          }),
        } as HTMLElement,
      ],
    ]);

    const visible = measureVisibleThumbIdsInRoot(
      root,
      nodes,
      THUMB_VISIBILITY_ROOT_MARGIN_PX,
    );
    expect(visible.has("visible")).toBe(true);
    expect(visible.has("nearby")).toBe(true);
    expect(visible.has("far-below")).toBe(false);
  });
});
