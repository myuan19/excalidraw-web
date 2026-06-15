import { useEffect } from "react";

import { logEditorOpenPhase } from "../lib/editorOpenPhases";

/** Suspense fallback while the editor shell JS chunk loads — console only, no UI. */
export function EditorShellChunkFallback({
  editorKind,
}: {
  editorKind?: string;
}) {
  useEffect(() => {
    logEditorOpenPhase("shell_chunk", { editorKind: editorKind ?? null });
  }, [editorKind]);

  return null;
}
