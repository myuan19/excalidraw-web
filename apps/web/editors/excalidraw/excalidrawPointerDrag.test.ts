import { afterEach, describe, expect, it, vi } from "vitest";

import {
  beginExcalidrawPointerDrag,
  endExcalidrawPointerDrag,
  flushExcalidrawDeferredHostWorkForTests,
  isExcalidrawPointerDragActive,
  runAfterExcalidrawPointerDrag,
  shouldDeferHeavyHostWorkForExcalidraw,
} from "./excalidrawPointerDrag";

describe("excalidrawPointerDrag", () => {
  afterEach(() => {
    flushExcalidrawDeferredHostWorkForTests();
    vi.useRealTimers();
  });

  it("tracks nested pointer drag sessions", () => {
    expect(isExcalidrawPointerDragActive()).toBe(false);
    beginExcalidrawPointerDrag();
    expect(isExcalidrawPointerDragActive()).toBe(true);
    beginExcalidrawPointerDrag();
    endExcalidrawPointerDrag();
    expect(isExcalidrawPointerDragActive()).toBe(true);
    endExcalidrawPointerDrag();
    expect(isExcalidrawPointerDragActive()).toBe(false);
  });

  it("defers host work until the drag ends", async () => {
    const run = vi.fn();
    beginExcalidrawPointerDrag();
    runAfterExcalidrawPointerDrag(run);
    expect(run).not.toHaveBeenCalled();
    endExcalidrawPointerDrag();
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("keeps host work deferred during post-drag cooldown", () => {
    vi.useFakeTimers();
    beginExcalidrawPointerDrag();
    endExcalidrawPointerDrag();
    expect(shouldDeferHeavyHostWorkForExcalidraw()).toBe(true);
    vi.advanceTimersByTime(401);
    expect(shouldDeferHeavyHostWorkForExcalidraw()).toBe(false);
  });
});
