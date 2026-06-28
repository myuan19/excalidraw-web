import { afterEach, describe, expect, it, vi } from "vitest";

import { FileSyncState } from "../data/FileSyncState";
import { clearTabFileDirty, markTabFileDirty } from "../data/tabFileDirtyState";
import { markEditorPaneEditPipeline } from "./editorPaneEditPipeline";

import {
  describeEditorPaneRunState,
  shouldKeepEditorPaneRunningInBackground,
  subscribeEditorPaneRunState,
} from "./editorPaneRunState";

describe("editorPaneRunState", () => {
  const fileId = "pane-run-state-file";

  afterEach(() => {
    clearTabFileDirty(fileId);
    FileSyncState.clearHashStateForFile(fileId);
  });

  it("keeps only dirty panes running in the background", () => {
    FileSyncState.alignHashes(fileId, "baseline");
    expect(shouldKeepEditorPaneRunningInBackground(fileId)).toBe(false);

    FileSyncState.setDraftHash(fileId, "draft");
    expect(shouldKeepEditorPaneRunningInBackground(fileId)).toBe(true);

    FileSyncState.alignHashes(fileId, "draft");
    expect(shouldKeepEditorPaneRunningInBackground(fileId)).toBe(false);

    markTabFileDirty(fileId);
    expect(shouldKeepEditorPaneRunningInBackground(fileId)).toBe(true);
    expect(describeEditorPaneRunState(fileId)).toMatchObject({
      hasUnsavedChanges: false,
      tabFileDirty: true,
      keepRunning: true,
      syncState: "synced",
    });
  });

  it("subscribes to the sync-state event that dirty writers already emit", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeEditorPaneRunState(listener);

    window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("keeps panes running while the edit pipeline is active", () => {
    FileSyncState.alignHashes(fileId, "baseline");
    expect(shouldKeepEditorPaneRunningInBackground(fileId)).toBe(false);

    const release = markEditorPaneEditPipeline(fileId, "idle-save");
    expect(shouldKeepEditorPaneRunningInBackground(fileId)).toBe(true);
    expect(describeEditorPaneRunState(fileId)).toMatchObject({
      hasUnsavedChanges: false,
      tabFileDirty: false,
      editPipelineActive: true,
      keepRunning: true,
    });

    release();
    expect(shouldKeepEditorPaneRunningInBackground(fileId)).toBe(false);
  });
});
