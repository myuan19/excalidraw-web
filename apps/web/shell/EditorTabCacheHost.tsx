import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FileList } from "../components/FileList";
import { EditorPlatformShell } from "../components/EditorPlatformSidebar";
import { EditorPlatformDialogHost } from "../components/EditorPlatformDialogHost";
import { logFileListOpen } from "../lib/logger";
import { devDebug } from "../lib/devDebug";
import { id8, traceFileOpen } from "../lib/interactionDebugTrace";
import {
  buildTabCacheHostSnapshot,
  publishTabCacheHostSnapshot,
  traceTabCache,
  traceTabCacheWhiteScreen,
} from "../lib/editorTabCacheTrace";
import { traceUserAction } from "../lib/userTrace";
import { editorRegistry } from "../editors";
import { hashNeedsEditorRoute } from "../data/documentHash";
import { stashLibraryUrlImportFromHash } from "../data/libraryUrlImport";
import { useHomePageWheelZoom } from "../hooks/useHomePageWheelZoom";
import { EditorPaneStack } from "./EditorPaneStack";
import { openEditorFileTab, reconcileEditorTabsWithHash } from "./editorTabNavigation";
import {
  EDITOR_TABS_CHANGE_EVENT,
  HOME_TAB_ID,
  listFileEditorTabsForPaneStack,
  readEditorTabsState,
  type EditorTabsState,
} from "./editorTabs";

import "./EditorTabCacheHost.scss";

function buildFileHash(id: string, kind?: string): string {
  return editorRegistry.buildFileHash(id, kind);
}

/** P0: read tabs only; hash reconcile for deep links; session restore is coordinator-owned. */
function bootstrapEditorTabCacheState(): EditorTabsState {
  stashLibraryUrlImportFromHash();
  if (hashNeedsEditorRoute(window.location.hash)) {
    reconcileEditorTabsWithHash(window.location.hash);
  }
  return readEditorTabsState();
}

export function EditorTabCacheHost({
  onFileListReady,
}: {
  onFileListReady: () => void;
}) {
  const [tabState, setTabState] = useState<EditorTabsState>(() =>
    bootstrapEditorTabCacheState(),
  );
  const homeContainerRef = useRef<HTMLDivElement>(null);
  const lastReconcileKeyRef = useRef<string | null>(null);
  const fileTabs = useMemo(
    () => listFileEditorTabsForPaneStack(tabState),
    [tabState],
  );
  const hasFileTabs = fileTabs.length > 0;
  const activeFileTab =
    tabState.activeTabId === HOME_TAB_ID
      ? null
      : fileTabs.find((tab) => tab.id === tabState.activeTabId) ?? null;
  /** 运行时以标签页为准；冷启动 intent 的 shellMode 不会随打开文件更新。 */
  const showHomePane = tabState.activeTabId === HOME_TAB_ID;
  const showEditorShell = !showHomePane;
  const homeActive = showHomePane;

  useEffect(() => {
    const sync = () => {
      const next = readEditorTabsState();
      traceTabCache("sync", {
        activeTabId: next.activeTabId,
        tabCount: next.tabs.length,
        fileTabCount: next.tabs.filter((tab) => tab.type === "file").length,
        hash: window.location.hash,
      });
      devDebug("app", "[DEBUG] EditorTabCacheHost | sync", {
        activeTabId: next.activeTabId,
        tabCount: next.tabs.length,
        fileTabCount: next.tabs.filter((tab) => tab.type === "file").length,
      });
      setTabState(next);
    };
    const onHashChange = () => {
      reconcileEditorTabsWithHash(window.location.hash);
      sync();
    };
    window.addEventListener(EDITOR_TABS_CHANGE_EVENT, sync);
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener(EDITOR_TABS_CHANGE_EVENT, sync);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  useHomePageWheelZoom(homeContainerRef, showHomePane);

  useEffect(() => {
    const snapshot = buildTabCacheHostSnapshot({
      activeTabId: tabState.activeTabId,
      hash: window.location.hash,
      homeActive: showHomePane,
      hasFileTabs,
      activeFileTab,
      fileTabs,
    });
    publishTabCacheHostSnapshot(snapshot);

    if (!showHomePane && !activeFileTab) {
      traceTabCacheWhiteScreen(snapshot, "no-active-file-pane");
      devDebug("app", "[DEBUG] EditorTabCacheHost | active tab has no pane", {
        activeTabId: tabState.activeTabId,
        tabIds: tabState.tabs.map((tab) => tab.id),
        fileTabIds: fileTabs.map((tab) => tab.id),
        hash: window.location.hash,
      });
      const reconcileKey = `${tabState.activeTabId}|${window.location.hash}`;
      if (lastReconcileKeyRef.current !== reconcileKey) {
        lastReconcileKeyRef.current = reconcileKey;
        reconcileEditorTabsWithHash(window.location.hash);
      }
      return;
    }
    lastReconcileKeyRef.current = null;
  }, [
    activeFileTab,
    fileTabs,
    hasFileTabs,
    showHomePane,
    tabState.activeTabId,
    tabState.tabs,
  ]);

  const onOpenFile = useCallback(
    ({
      id,
      kind,
      name,
      absPath,
    }: {
      id: string;
      kind?: string;
      name?: string;
      absPath?: string | null;
    }) => {
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
        absPath: absPath ?? null,
      });
    },
    [],
  );

  const hostClassName = [
    "editor-tab-cache-host",
    showHomePane
      ? "editor-tab-cache-host--home-active"
      : "editor-tab-cache-host--file-active",
  ].join(" ");

  return (
    <div className={hostClassName}>
      <div id="editor-platform-dialog-root" />
      <EditorPlatformDialogHost />
      <div
        ref={homeContainerRef}
        className={[
          "editor-tab-cache-pane",
          "editor-tab-cache-pane--home",
          showHomePane
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
      {showEditorShell ? (
        <EditorPlatformShell>
          <EditorPaneStack tabState={tabState} />
        </EditorPlatformShell>
      ) : null}
    </div>
  );
}
