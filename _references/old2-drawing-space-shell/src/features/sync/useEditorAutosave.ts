import { useEffect, useRef } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { isLocalTempFileId } from "@/features/tempFiles/tempFileId";
import { FileSyncState } from "./FileSyncState";

const AUTOSAVE_INTERVAL_MS = 30_000;

export function useEditorAutosave() {
  const activeFile = useEditorStore((state) => state.activeFile);
  const saving = useEditorStore((state) => state.saving);
  const saveActiveFile = useEditorStore((state) => state.saveActiveFile);
  const flushPendingDraft = useEditorStore((state) => state.flushPendingDraft);
  const savingRef = useRef(false);

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  useEffect(() => {
    if (!activeFile) return undefined;

    const saveIfIdle = () => {
      flushPendingDraft();
      if (savingRef.current) return;
      if (!FileSyncState.hasUnsavedChanges(activeFile.id)) return;
      void saveActiveFile().catch(() => undefined);
    };

    const interval = window.setInterval(saveIfIdle, AUTOSAVE_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") saveIfIdle();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      flushPendingDraft();
      if (isLocalTempFileId(activeFile.id)) return;
      if (!FileSyncState.hasUnsavedChanges(activeFile.id)) return;
      saveIfIdle();
      event.preventDefault();
      event.returnValue = "";
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [activeFile, flushPendingDraft, saveActiveFile]);
}
