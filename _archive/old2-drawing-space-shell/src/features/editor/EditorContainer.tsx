import { useEffect, useRef } from "react";
import { describeElementRect, editorDebugLog } from "@/features/logging/editorDebugLog";
import type { EditorAdapter } from "@/types/editor";
import { useAppStore } from "@/stores/appStore";
import { useEditorStore } from "@/stores/editorStore";

function scheduleEditorResize(editor: EditorAdapter, label: string) {
  requestAnimationFrame(() => {
    editorDebugLog(`EditorContainer.${label}.resize.rAF1`, { editorId: editor.id });
    editor.resize?.();
    requestAnimationFrame(() => {
      editorDebugLog(`EditorContainer.${label}.resize.rAF2`, { editorId: editor.id });
      editor.resize?.();
    });
  });
}

export function EditorContainer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeView = useAppStore((s) => s.activeView);
  const activeEditor = useEditorStore((s) => s.activeEditor);
  const activeFile = useEditorStore((s) => s.activeFile);
  const mountedEditorRef = useRef<typeof activeEditor>(null);

  useEffect(() => {
    editorDebugLog("EditorContainer.state", {
      activeView,
      editorId: activeEditor?.id ?? null,
      fileId: activeFile?.id ?? null,
      fileKind: activeFile?.kind ?? null,
      hasContainerRef: !!containerRef.current,
    });
  }, [activeView, activeEditor, activeFile]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !activeEditor) {
      editorDebugLog("EditorContainer.mountEffect.skip", {
        hasElement: !!el,
        hasEditor: !!activeEditor,
        activeView,
      });
      return;
    }

    const viewport = document.querySelector(".editor-viewport");
    const viewportBody = document.querySelector(".editor-viewport-body");

    editorDebugLog("EditorContainer.mountEffect.start", {
      editorId: activeEditor.id,
      fileId: activeFile?.id ?? null,
      container: describeElementRect(el),
      viewport: describeElementRect(viewport instanceof HTMLElement ? viewport : null),
      viewportBody: describeElementRect(viewportBody instanceof HTMLElement ? viewportBody : null),
    });

    activeEditor.mount(el);
    mountedEditorRef.current = activeEditor;
    scheduleEditorResize(activeEditor, "mount");

    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver((entries) => {
        const entry = entries[0];
        editorDebugLog("EditorContainer.resizeObserver", {
          editorId: activeEditor.id,
          width: entry ? Math.round(entry.contentRect.width) : 0,
          height: entry ? Math.round(entry.contentRect.height) : 0,
        });
        activeEditor.resize?.();
      })
      : null;
    resizeObserver?.observe(el);

    requestAnimationFrame(() => {
      editorDebugLog("EditorContainer.afterMount.rAF", {
        editorId: activeEditor.id,
        container: describeElementRect(el),
        childCount: el.childElementCount,
        firstChildTag: el.firstElementChild?.tagName ?? null,
      });
    });

    return () => {
      resizeObserver?.disconnect();
      const editor = mountedEditorRef.current;
      mountedEditorRef.current = null;
      if (!editor) return;
      editorDebugLog("EditorContainer.unmount", { editorId: editor.id });
      editor.unmount();
    };
  }, [activeEditor]);

  if (!activeEditor) {
    editorDebugLog("EditorContainer.render.null", { activeView });
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="h-full min-h-0 w-full"
      data-editor-id={activeEditor.id}
      data-file-id={activeFile?.id ?? ""}
    />
  );
}
