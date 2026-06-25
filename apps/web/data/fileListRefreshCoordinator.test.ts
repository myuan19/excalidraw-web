import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cancelDebouncedFileListRefresh,
  FILE_LIST_INCREMENTAL_SAVE_SKIP_MS,
  FILE_LIST_SILENT_REFRESH_DEBOUNCE_MS,
  markFileListIncrementalSave,
  scheduleDebouncedFileListRefresh,
  shouldSkipSilentTreeRefreshAfterIncrementalSave,
} from "./fileListRefreshCoordinator";

describe("fileListRefreshCoordinator", () => {
  afterEach(() => {
    cancelDebouncedFileListRefresh();
    vi.useRealTimers();
  });

  it("debounces refresh callbacks", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    scheduleDebouncedFileListRefresh(run);
    scheduleDebouncedFileListRefresh(run);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(FILE_LIST_SILENT_REFRESH_DEBOUNCE_MS);
    expect(run).toHaveBeenCalledOnce();
  });

  it("skips silent tree refresh shortly after incremental save", () => {
    markFileListIncrementalSave("file-1");
    expect(shouldSkipSilentTreeRefreshAfterIncrementalSave("file-1")).toBe(true);
    expect(shouldSkipSilentTreeRefreshAfterIncrementalSave("file-2")).toBe(false);
    vi.useFakeTimers();
    vi.advanceTimersByTime(FILE_LIST_INCREMENTAL_SAVE_SKIP_MS + 1);
    expect(shouldSkipSilentTreeRefreshAfterIncrementalSave("file-1")).toBe(false);
  });
});
