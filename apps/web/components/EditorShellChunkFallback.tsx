import { useEffect } from "react";

import { traceTabCache } from "../lib/editorTabCacheTrace";
import { logEditorOpenPhase } from "../lib/editorOpenPhases";

/** Suspense fallback while the editor shell JS chunk loads. */
export function EditorShellChunkFallback({
  editorKind,
  tabId,
  fileId8,
}: {
  editorKind?: string;
  tabId?: string;
  fileId8?: string | null;
}) {
  useEffect(() => {
    logEditorOpenPhase("shell_chunk", { editorKind: editorKind ?? null });
    traceTabCache(
      "shellChunkLoading",
      {
        editorKind: editorKind ?? null,
        tabId: tabId ?? null,
        fileId8: fileId8 ?? null,
      },
      "start",
    );
    return () => {
      traceTabCache(
        "shellChunkLoading",
        {
          editorKind: editorKind ?? null,
          tabId: tabId ?? null,
          fileId8: fileId8 ?? null,
        },
        "ok",
      );
    };
  }, [editorKind, fileId8, tabId]);

  return (
    <div
      className="editor-shell-chunk-fallback"
      style={{
        padding: 24,
        color: "var(--nb-text-muted, #64748b)",
        fontFamily: "var(--nb-font-ui, system-ui, sans-serif)",
        fontSize: 13,
      }}
    >
      正在加载编辑器…
    </div>
  );
}
