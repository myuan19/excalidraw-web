import { beforeEach, describe, expect, it } from "vitest";

import { FileSyncState } from "../../data/FileSyncState";
import {
  clearTabFileDirty,
  markTabFileDirty,
} from "../../data/tabFileDirtyState";

import { markMindMapNativeDirtyPending } from "./mindMapDraftState";
import { canSkipMindMapNativeSyncOnLeave } from "./mindMapLeaveState";

describe("mindMapLeaveState", () => {
  const fileId = "test-mindmap-file-id";

  beforeEach(() => {
    localStorage.clear();
    clearTabFileDirty(fileId);
  });

  it("skips native leave sync when stored state and tab state are clean", () => {
    FileSyncState.alignHashes(fileId, "same-hash");

    expect(canSkipMindMapNativeSyncOnLeave(fileId)).toBe(true);
  });

  it("does not skip native leave sync when stored draft differs", () => {
    FileSyncState.setBaselineHash(fileId, "baseline");
    FileSyncState.setDraftHash(fileId, "draft");

    expect(canSkipMindMapNativeSyncOnLeave(fileId)).toBe(false);
  });

  it("does not skip native leave sync while native dirty is pending", () => {
    FileSyncState.alignHashes(fileId, "same-hash");
    markMindMapNativeDirtyPending(fileId);

    expect(canSkipMindMapNativeSyncOnLeave(fileId)).toBe(false);
  });

  it("does not skip native leave sync when this tab has immediate dirty state", () => {
    FileSyncState.alignHashes(fileId, "same-hash");
    markTabFileDirty(fileId);

    expect(canSkipMindMapNativeSyncOnLeave(fileId)).toBe(false);
  });
});
