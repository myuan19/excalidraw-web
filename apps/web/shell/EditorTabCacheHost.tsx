import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { FileList } from "../components/FileList";
import { EditorPlatformShell } from "../components/EditorPlatformSidebar";
import { EditorPlatformDialogHost } from "../components/EditorPlatformDialogHost";
import { EditorShellChunkFallback } from "../components/EditorShellChunkFallback";
import { recordRecentFileAccess } from "../data/recentFiles";
import { logFileListOpen } from "../lib/logger";
import { devDebug } from "../lib/devDebug";
import { traceTab, id8, traceFileOpen } from "../lib/interactionDebugTrace";
import { traceUserAction } from "../lib/userTrace";
import { editorRegistry } from "../editors";
import { getLazyEditorShell } from "../editors/lazyViews";
import { useHomePageWheelZoom } from "../hooks/useHomePageWheelZoom";
import { openEditorFileTab } from "./editorTabNavigation";
import {
  EDITOR_TABS_CHANGE_EVENT,
  HOME_TAB_ID,
  readEditorTabsState,
  type EditorTabsState,
  type FileEditorTab,
} from "./editorTabs";

import "./EditorTabCacheHost.scss";

function buildFileHash(id: string, kind?: string): string {
  return editorRegistry.buildFileHash(id, kind);
}

function CachedFileEditorPane({
  tab,
  active,
}: {
  tab: FileEditorTab;
  active: boolean;
}) {
  useEffect(() => {
    traceTab("editorPane.active", {
      tabId: tab.id,
      fileId8: id8(tab.fileId),
      kind: tab.kind,
      active,
    }, active ? "ok" : "branch");
  }, [active, tab.id, tab.fileId, tab.kind]);

  const editorDefinition = editorRegistry.getByKind(tab.kind);
  if (!editorDefinition) {
    devDebug("app", "[DEBUG] EditorTabCacheHost | missing editor definition", {
      tabId: tab.id,
      fileId8: tab.fileId.slice(0, 8),
      kind: tab.kind,
      active,
    });
    return null;
  }

  const LazyEditor = getLazyEditorShell(editorDefinition);
  if (!LazyEditor) {
    devDebug("app", "[DEBUG] EditorTabCacheHost | missing lazy editor", {
      tabId: tab.id,
      fileId8: tab.fileId.slice(0, 8),
      kind: tab.kind,
      active,
    });
    return null;
  }

  return (
    <div
      className={[
        "editor-tab-cache-pane",
        active ? "editor-tab-cache-pane--active" : "editor-tab-cache-pane--cached",
      ]
        .filter(Boolean)
        .join(" ")}
      data-tab-id={tab.id}
      data-file-id={tab.fileId}
    >
      <Suspense fallback={<EditorShellChunkFallback editorKind={tab.kind} />}>
        <LazyEditor
          pinnedFileId={tab.fileId}
          isEditorTabActive={active}
        />
      </Suspense>
    </div>
  );
}

export function EditorTabCacheHost({
  onFileListReady,
}: {
  onFileListReady: () => void;
}) {
  const [tabState, setTabState] = useState<EditorTabsState>(() =>
    readEditorTabsState(),
  );
  const homeContainerRef = useRef<HTMLDivElement>(null);
  const homeActive = tabState.activeTabId === HOME_TAB_ID;
  const fileTabs = tabState.tabs.filter(
    (tab): tab is FileEditorTab => tab.type === "file",
  );
  const hasFileTabs = fileTabs.length > 0;
  const activeFileTab =
    tabState.activeTabId === HOME_TAB_ID
      ? null
      : fileTabs.find((tab) => tab.id === tabState.activeTabId) ?? null;

  useEffect(() => {
    const sync = () => {
      const next = readEditorTabsState();
      devDebug("app", "[DEBUG] EditorTabCacheHost | sync", {
        activeTabId: next.activeTabId,
        tabCount: next.tabs.length,
        fileTabCount: next.tabs.filter((tab) => tab.type === "file").length,
      });
      setTabState(next);
    };
    window.addEventListener(EDITOR_TABS_CHANGE_EVENT, sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener(EDITOR_TABS_CHANGE_EVENT, sync);
      window.removeEventListener("hashchange", sync);
    };
  }, []);

  useHomePageWheelZoom(homeContainerRef, homeActive);

  useEffect(() => {
    if (homeActive || activeFileTab) {
      return;
    }
    devDebug("app", "[DEBUG] EditorTabCacheHost | active tab has no pane", {
      activeTabId: tabState.activeTabId,
      tabIds: tabState.tabs.map((tab) => tab.id),
      fileTabIds: fileTabs.map((tab) => tab.id),
    });
  }, [activeFileTab, fileTabs, homeActive, tabState.activeTabId, tabState.tabs]);

  const onOpenFile = useCallback(
    ({ id, kind, name }: { id: string; kind?: string; name?: string }) => {
      recordRecentFileAccess(id);
      const resolvedKind = editorRegistry.resolveKind(kind);
      const next = buildFileHash(id, resolvedKind);
      traceFileOpen("openEditorTab", {
        fileId8: id8(id),
        kind: resolvedKind,
        nextHash: next,
        name: name ?? null,
      });
      traceUserAction(
        "file-list",
        "onOpenFile",
        {
          id8: id.slice(0, 8),
          kind: resolvedKind,
          nextHash: next,
        },
        "start",
      );
      logFileListOpen("EditorTabCacheHost onOpenFile → open editor tab", {
        id8: id.slice(0, 8),
        kind: resolvedKind,
        nextHash: next,
      });
      void openEditorFileTab({
        fileId: id,
        kind: resolvedKind,
        title: name,
      });
    },
    [],
  );

  const hostClassName = [
    "editor-tab-cache-host",
    homeActive
      ? "editor-tab-cache-host--home-active"
      : "editor-tab-cache-host--file-active",
  ].join(" ");

  const fileStack = (
    <div className="editor-tab-cache-file-stack">
      {fileTabs.map((tab) => (
        <CachedFileEditorPane
          key={tab.id}
          tab={tab}
          active={tab.id === tabState.activeTabId}
        />
      ))}
    </div>
  );

  return (
    <div className={hostClassName}>
      <div id="editor-platform-dialog-root" />
      <EditorPlatformDialogHost />
      <div
        ref={homeContainerRef}
        className={[
          "editor-tab-cache-pane",
          "editor-tab-cache-pane--home",
          homeActive
            ? "editor-tab-cache-pane--active"
            : "editor-tab-cache-pane--cached",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="excalidraw-app" style={{ height: "100%" }}>
          <FileList onOpenFile={onOpenFile} onReady={onFileListReady} />
        </div>
      </div>
      {hasFileTabs ? (
        <EditorPlatformShell>{fileStack}</EditorPlatformShell>
      ) : null}
    </div>
  );
}
