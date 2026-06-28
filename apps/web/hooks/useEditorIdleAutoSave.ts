import { useEditorPaneMountGate } from "../shell/editorPaneLifecycle";

import {
  useIdleAutoSaveRearm,
  type UseIdleAutoSaveRearmOptions,
} from "./useIdleAutoSaveRearm";

/**
 * Cached editor panes share the same idle auto-save rearm policy as MindMap:
 * mount once foreground, keep running in background, rearm per pinned fileId.
 */
export function useEditorIdleAutoSave(
  fileId: string | null | undefined,
  isPaneForeground: boolean,
  onRearm: () => void,
  options?: UseIdleAutoSaveRearmOptions,
): void {
  const mountNativeFrame = useEditorPaneMountGate(isPaneForeground);
  useIdleAutoSaveRearm(fileId, mountNativeFrame, onRearm, options);
}
