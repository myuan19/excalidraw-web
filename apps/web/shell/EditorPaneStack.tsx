import { Suspense, useEffect, useState } from "react";

import { EditorPaneErrorBoundary } from "../components/EditorPaneErrorBoundary";
import { EditorShellChunkFallback } from "../components/EditorShellChunkFallback";
import { editorRegistry } from "../editors";
import { getLazyEditorShell } from "../editors/lazyViews";
import { devDebug } from "../lib/devDebug";
import { id8, traceTab } from "../lib/interactionDebugTrace";
import type { FileEditorTab } from "./editorTabs";
import { listFileEditorTabsForPaneStack, type EditorTabsState } from "./editorTabs";
import {
  describeEditorPaneRunState,
  shouldKeepEditorPaneRunningInBackground,
  subscribeEditorPaneRunState,
} from "./editorPaneRunState";
import {
  useStartupBackgroundEditorGate,
  useStartupForegroundEditorGate,
} from "../startup/StartupCoordinatorProvider";

import "./EditorPaneStack.scss";

function EditorPaneStackItem({
  tab,
  isForeground,
}: {
  tab: FileEditorTab;
  isForeground: boolean;
}) {
  const [keepRunning, setKeepRunning] = useState(() =>
    shouldKeepEditorPaneRunningInBackground(tab.fileId),
  );

  useEffect(() => {
    const sync = () => {
      const next = shouldKeepEditorPaneRunningInBackground(tab.fileId);
      setKeepRunning((prev) => (prev === next ? prev : next));
    };
    sync();
    return subscribeEditorPaneRunState(sync);
  }, [tab.fileId]);

  useEffect(() => {
    traceTab(
      "editorPane.foreground",
      {
        tabId: tab.id,
        fileId8: id8(tab.fileId),
        kind: tab.kind,
        isForeground,
        keepRunning,
        runState: describeEditorPaneRunState(tab.fileId),
      },
      isForeground ? "ok" : "branch",
    );
  }, [isForeground, keepRunning, tab.id, tab.fileId, tab.kind]);

  // Hooks 必须在任何 early return 之前调用，否则 definition/LazyEditor 短暂
  // 缺失再出现时 hook 数量变化，React 会直接抛错。
  const canMountForeground = useStartupForegroundEditorGate(isForeground);
  const canMountBackground = useStartupBackgroundEditorGate(
    isForeground,
    keepRunning,
  );

  const editorDefinition = editorRegistry.getByKind(tab.kind);
  if (!editorDefinition) {
    devDebug("app", "[DEBUG] EditorPaneStack | missing editor definition", {
      tabId: tab.id,
      fileId8: tab.fileId.slice(0, 8),
      kind: tab.kind,
      isForeground,
    });
    return null;
  }

  const LazyEditor = getLazyEditorShell(editorDefinition);
  if (!LazyEditor) {
    devDebug("app", "[DEBUG] EditorPaneStack | missing lazy editor", {
      tabId: tab.id,
      fileId8: tab.fileId.slice(0, 8),
      kind: tab.kind,
      isForeground,
    });
    return null;
  }

  const shouldMountEditor = isForeground
    ? canMountForeground
    : canMountBackground;

  return (
    <EditorPaneErrorBoundary
      tabId={tab.id}
      fileId8={id8(tab.fileId)}
      kind={tab.kind}
    >
      <div
        className={[
          "editor-pane-stack__pane",
          isForeground
            ? "editor-pane-stack__pane--foreground"
            : "editor-pane-stack__pane--background",
          !isForeground && keepRunning
            ? "editor-pane-stack__pane--keep-running"
            : "",
        ].join(" ")}
        data-tab-id={tab.id}
        data-file-id={tab.fileId}
        data-editor-kind={tab.kind}
        data-pane-foreground={isForeground ? "1" : "0"}
        data-pane-keep-running={keepRunning ? "1" : "0"}
      >
        <Suspense
          fallback={
            <EditorShellChunkFallback
              editorKind={tab.kind}
              tabId={tab.id}
              fileId8={id8(tab.fileId)}
            />
          }
        >
          {shouldMountEditor ? (
            <LazyEditor
              pinnedFileId={tab.fileId}
              isPaneForeground={isForeground}
            />
          ) : (
            <EditorShellChunkFallback
              editorKind={tab.kind}
              tabId={tab.id}
              fileId8={id8(tab.fileId)}
            />
          )}
        </Suspense>
      </div>
    </EditorPaneErrorBoundary>
  );
}

export function EditorPaneStack({
  tabState,
}: {
  tabState: EditorTabsState;
}) {
  const paneTabs = listFileEditorTabsForPaneStack(tabState);
  const activeTabId = tabState.activeTabId;

  return (
    <div className="editor-pane-stack" data-pane-count={paneTabs.length}>
      {paneTabs.map((tab) => (
        <EditorPaneStackItem
          key={tab.id}
          tab={tab}
          isForeground={tab.id === activeTabId}
        />
      ))}
    </div>
  );
}
