import { FileSyncState } from "../../data/FileSyncState";
import { isTabFileDirty } from "../../data/tabFileDirtyState";

import { isMindMapNativeDirtyPending } from "./mindMapDraftState";

/**
 * Server-side MindMap files that are already clean should not ask the iframe
 * for a leave-time snapshot. That snapshot may contain native-only
 * normalization differences and must not turn a green badge yellow during
 * navigation. Real edits are still protected by tab-local dirty and pending
 * native dirty state.
 */
export function canSkipMindMapNativeSyncOnLeave(fileId: string): boolean {
  return (
    !FileSyncState.hasUnsavedChanges(fileId) &&
    !isMindMapNativeDirtyPending(fileId) &&
    !isTabFileDirty(fileId)
  );
}
