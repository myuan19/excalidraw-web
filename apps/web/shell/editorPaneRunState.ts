import { FileSyncState } from "../data/FileSyncState";
import { isTabFileDirty } from "../data/tabFileDirtyState";
import {
  EDITOR_FILE_SYNC_STATE_EVENT,
  isEditorPaneEditPipelineActive,
} from "./editorPaneEditPipeline";

export function describeEditorPaneRunState(fileId: string): {
  hasUnsavedChanges: boolean;
  tabFileDirty: boolean;
  editPipelineActive: boolean;
  keepRunning: boolean;
  syncState: string;
} {
  const hasUnsavedChanges = FileSyncState.hasUnsavedChanges(fileId);
  const tabFileDirty = isTabFileDirty(fileId);
  const editPipelineActive = isEditorPaneEditPipelineActive(fileId);
  return {
    hasUnsavedChanges,
    tabFileDirty,
    editPipelineActive,
    keepRunning:
      hasUnsavedChanges || tabFileDirty || editPipelineActive,
    syncState: FileSyncState.getSyncState(fileId),
  };
}

export function shouldKeepEditorPaneRunningInBackground(fileId: string): boolean {
  return describeEditorPaneRunState(fileId).keepRunning;
}

export function subscribeEditorPaneRunState(listener: () => void): () => void {
  window.addEventListener(EDITOR_FILE_SYNC_STATE_EVENT, listener);
  return () => {
    window.removeEventListener(EDITOR_FILE_SYNC_STATE_EVENT, listener);
  };
}
