import { Suspense } from "react";

import { EditorShellChunkFallback } from "../components/EditorShellChunkFallback";
import { editorRegistry } from "../editors";
import { getLazyEditorShell } from "../editors/lazyViews";

export function LibraryImportEditorPane() {
  const editorDefinition = editorRegistry.getByKind("excalidraw");
  const LazyEditor = getLazyEditorShell(editorDefinition);
  if (!LazyEditor) {
    return null;
  }

  return (
    <div className="editor-pane-stack editor-pane-stack--library-import">
      <Suspense
        fallback={
          <EditorShellChunkFallback editorKind="excalidraw" />
        }
      >
        <LazyEditor libraryImportOnly isPaneForeground />
      </Suspense>
    </div>
  );
}
