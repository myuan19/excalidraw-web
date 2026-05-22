import { useEffect, useRef, useState } from "react";
import { describeElementRect, editorDebugLog } from "@/features/logging/editorDebugLog";
import { Sidebar } from "./Sidebar";
import { useAppStore } from "@/stores/appStore";
import { useEditorStore } from "@/stores/editorStore";
import { EditorContainer } from "@/features/editor/EditorContainer";
import { FileSyncState, LocalDraftStorage, useEditorAutosave } from "@/features/sync";
import { LocalThumbnailCache } from "@/features/thumbnail";
import { ArchivePanel } from "@/features/history";
import { EmbedManager } from "@/features/settings/EmbedManager";
import { useApplyAppearance } from "@/features/settings";
import { useFileStore } from "@/stores/fileStore";
import { Dialog } from "@/components/ui/dialog";
import type { ServerFile } from "@/types/file";
import { emitMindMapHostSaveStatus } from "@/editors/mindmap/hostEvents";
import { SaveConflictDialog } from "@/components/editor/SaveConflictDialog";
import { TempSessionDialog } from "@/features/files/TempSessionDialog";
import { EditorPickerPanel } from "@/features/editor/EditorPickerPanel";
import { getFileBadge } from "@/features/files/fileBadgeState";
import { emitAppNotice } from "@/features/ui/appNotice";
import { showEditorView } from "@/features/navigation";
import { cn } from "@/lib/utils";
import { isLocalTempFileId } from "@/features/tempFiles/tempFileId";
import {
  APP_GO_HOME_EVENT,
  APP_LEAVE_EDITOR_EVENT,
  evaluateEditorLeave,
  finishLeaveAfterSave,
  finishLeaveDiscard,
} from "@/features/home/goHome";
import { HomeLeaveDialog } from "@/features/home/HomeLeaveDialog";
import { AppToast } from "@/components/app/AppToast";

export interface AppShellProps {
  pages: React.ReactNode;
}

export function AppShell({ pages }: AppShellProps) {
  useEditorAutosave();
  useApplyAppearance();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [leaveEditorOpen, setLeaveEditorOpen] = useState(false);
  const activeView = useAppStore((s) => s.activeView);
  const pendingNavigateView = useAppStore((s) => s.pendingNavigateView);
  const setPendingNavigateView = useAppStore((s) => s.setPendingNavigateView);
  const activeEditor = useEditorStore((s) => s.activeEditor);
  const activeFile = useEditorStore((s) => s.activeFile);
  const saving = useEditorStore((s) => s.saving);
  const saveError = useEditorStore((s) => s.saveError);
  const saveConflictOpen = useEditorStore((s) => s.saveConflictOpen);
  const saveActiveFile = useEditorStore((s) => s.saveActiveFile);
  const reloadActiveFileFromServer = useEditorStore((s) => s.reloadActiveFileFromServer);
  const dismissSaveConflict = useEditorStore((s) => s.dismissSaveConflict);
  const openFile = useEditorStore((s) => s.openFile);
  const updateFile = useFileStore((s) => s.updateFile);
  const [, setSyncVersion] = useState(0);
  const badge = activeFile ? getFileBadge(activeFile.id) : "synced";
  const embedFileId = activeFile && !isLocalTempFileId(activeFile.id) ? activeFile.id : undefined;

  useEffect(() => {
    const openHistory = () => {
      if (activeFile && isLocalTempFileId(activeFile.id)) {
        emitAppNotice({ level: "info", message: "保存后可查看历史版本", key: "history-gate" });
        return;
      }
      setHistoryOpen(true);
    };
    const openEmbed = () => {
      if (activeFile && isLocalTempFileId(activeFile.id)) {
        emitAppNotice({ level: "info", message: "保存后可配置嵌入", key: "embed-gate" });
        return;
      }
      setEmbedOpen(true);
    };
    const requestSave = () => {
      void saveActiveFile().catch((error) => {
        emitAppNotice({
          level: "error",
          message: error instanceof Error ? error.message : "保存失败",
          key: "save-error",
        });
      });
    };
    const onLeaveEditor = () => {
      setLeaveEditorOpen(true);
    };
    const onGoHome = () => {
      const result = evaluateEditorLeave("home");
      if (result === "prompt") setLeaveEditorOpen(true);
    };
    window.addEventListener("mindmap-host-open-history", openHistory);
    window.addEventListener("mindmap-host-open-embed", openEmbed);
    window.addEventListener("mindmap-host-request-save", requestSave);
    window.addEventListener("mindmap-host-back-to-files", onGoHome);
    window.addEventListener(APP_GO_HOME_EVENT, onGoHome);
    window.addEventListener(APP_LEAVE_EDITOR_EVENT, onLeaveEditor);
    return () => {
      window.removeEventListener("mindmap-host-open-history", openHistory);
      window.removeEventListener("mindmap-host-open-embed", openEmbed);
      window.removeEventListener("mindmap-host-request-save", requestSave);
      window.removeEventListener("mindmap-host-back-to-files", onGoHome);
      window.removeEventListener(APP_GO_HOME_EVENT, onGoHome);
      window.removeEventListener(APP_LEAVE_EDITOR_EVENT, onLeaveEditor);
    };
  }, [activeFile, saveActiveFile]);

  useEffect(() => {
    const onSyncStateChange = () => setSyncVersion((version) => version + 1);
    window.addEventListener("file-sync-state-change", onSyncStateChange);
    return () => window.removeEventListener("file-sync-state-change", onSyncStateChange);
  }, []);

  useEffect(() => {
    if (activeView !== "editor") {
      setLeaveEditorOpen(false);
    }
  }, [activeView]);

  useEffect(() => {
    const status = saveError
      ? "error"
      : saving
        ? "saving"
        : badge === "temp"
          ? "draft"
          : badge === "draft"
            ? "draft"
            : "saved";
    const message = saveError
      ? "保存失败"
      : saving
        ? "保存中"
        : badge === "temp"
          ? "临时文件，保存后同步"
          : badge === "draft"
            ? "未保存"
            : "已同步";
    emitMindMapHostSaveStatus({ saving, status, message, error: saveError });
  }, [saveError, saving, badge]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!activeFile || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") {
        return;
      }
      event.preventDefault();
      void saveActiveFile();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeFile, saveActiveFile]);

  function handleArchiveRestored(file: ServerFile & { data: unknown }) {
    LocalDraftStorage.remove(file.id);
    LocalThumbnailCache.clear(file.id);
    FileSyncState.markSynced(file.id, file.content_sha256 ?? null);
    updateFile(file.id, file);
    showEditorView();
    openFile(file, JSON.stringify(file.data ?? {}));
    setHistoryOpen(false);
  }

  function closeLeaveDialog() {
    setLeaveEditorOpen(false);
    setPendingNavigateView(null);
  }

  const leaveTargetView = pendingNavigateView ?? "home";
  const editorViewportRef = useRef<HTMLDivElement>(null);
  const editorLayerVisible = activeView === "editor";

  useEffect(() => {
    if (!editorLayerVisible || !activeEditor) return;
    requestAnimationFrame(() => {
      activeEditor.resize?.();
      requestAnimationFrame(() => activeEditor.resize?.());
    });
  }, [editorLayerVisible, activeEditor, activeFile?.id]);

  useEffect(() => {
    editorDebugLog("AppShell.editorState", {
      activeView,
      hasActiveEditor: !!activeEditor,
      editorId: activeEditor?.id ?? null,
      fileId: activeFile?.id ?? null,
      fileKind: activeFile?.kind ?? null,
      showPicker: editorLayerVisible && !activeEditor,
      showContainer: editorLayerVisible && !!activeEditor,
      editorLayerVisible,
    });
  }, [activeView, activeEditor, activeFile]);

  useEffect(() => {
    if (activeView !== "editor") return;
    const logLayout = (label: string) => {
      editorDebugLog(`AppShell.layout.${label}`, {
        viewport: describeElementRect(editorViewportRef.current),
        body: describeElementRect(
          editorViewportRef.current?.querySelector(".editor-viewport-body") ?? null,
        ),
        window: { innerWidth: window.innerWidth, innerHeight: window.innerHeight },
      });
    };
    logLayout("immediate");
    requestAnimationFrame(() => logLayout("rAF"));
  }, [activeView, activeEditor, activeFile?.id]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="app-main min-h-screen pl-sidebar">
        <div
          ref={editorViewportRef}
          className={cn(
            "editor-viewport editor-layer",
            !editorLayerVisible && "editor-layer--hidden",
          )}
          aria-hidden={!editorLayerVisible}
        >
          {activeEditor ? (
            <>
              {saveError && (
                <div className="editor-save-error editor-save-error-banner absolute left-lg right-lg top-lg z-20">
                  保存失败：{saveError}
                </div>
              )}
              <div className="editor-viewport-body">
                <EditorContainer />
              </div>
            </>
          ) : editorLayerVisible ? (
            <EditorPickerPanel />
          ) : null}
        </div>

        <div
          className={cn(
            "page-layer min-h-screen",
            editorLayerVisible && "page-layer--hidden",
          )}
          aria-hidden={editorLayerVisible}
        >
          {pages}
        </div>
      </main>

      <ArchivePanel
        open={historyOpen}
        file={embedFileId ? activeFile : null}
        onClose={() => setHistoryOpen(false)}
        onRestored={handleArchiveRestored}
      />
      <Dialog open={embedOpen} onClose={() => setEmbedOpen(false)} size="xl">
        <EmbedManager
          fileId={embedFileId}
          fileName={activeFile?.name}
        />
      </Dialog>
      <SaveConflictDialog
        open={saveConflictOpen}
        fileName={activeFile?.name ?? "未命名"}
        onDismiss={dismissSaveConflict}
        onReload={() => void reloadActiveFileFromServer()}
        onOverwrite={() => {
          dismissSaveConflict();
          void saveActiveFile({ forceOverwrite: true });
        }}
      />
      <HomeLeaveDialog
        open={leaveEditorOpen && !!activeFile}
        fileName={activeFile?.name ?? "未命名"}
        saving={saving}
        onClose={closeLeaveDialog}
        onSaveAndLeave={() => {
          void finishLeaveAfterSave(leaveTargetView)
            .then(closeLeaveDialog)
            .catch((error) => {
              alert(error instanceof Error ? error.message : String(error));
            });
        }}
        onDiscardAndLeave={() => {
          finishLeaveDiscard(leaveTargetView);
          closeLeaveDialog();
        }}
      />
      <TempSessionDialog />
      <AppToast />
    </div>
  );
}
