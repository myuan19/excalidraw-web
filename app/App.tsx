import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";

import {
  Provider,
  appJotaiStore,
} from "./app-jotai";
import { TopErrorBoundary } from "./components/TopErrorBoundary";
import { DebugModeTrigger } from "./components/DebugModeTrigger";
import { FileList } from "./components/FileList";
import { EditorPlatformShell } from "./components/EditorPlatformSidebar";
import { recordRecentFileAccess } from "./data/recentFiles";
import { logFileListOpen } from "./lib/logger";
import { devDebug } from "./lib/devDebug";
import { isEmbedMode } from "./embed/embedMode";
import { editorRegistry } from "./editors";
import { getLazyEditorShell } from "./editors/lazyViews";
import { hashNeedsEditorRoute } from "./data/documentHash";
import { getFileIdFromHash } from "./data/fileIdFromHash";
import { getDocumentKindFromHash } from "./lib/appBranding";
import { EditorShellChunkFallback } from "./components/EditorShellChunkFallback";
import { logEditorOpenPhase } from "./lib/editorOpenPhases";

import "./index.scss";

const LazyEmbedApp = lazy(() => import("./embed/EmbedApp"));

/**
 * Prefetch the editor chunk in the background, but only AFTER the file list
 * has finished loading its data (signalled via `onReady`).  This avoids
 * flooding the network during initial page load while still making the first
 * file-open feel fast.
 */
function useDeferredEditorPrefetch() {
  const firedRef = useRef(false);

  const onFileListReady = useCallback(() => {
    if (firedRef.current) {
      return;
    }
    firedRef.current = true;
    // Small delay so thumbnails can start loading first.
    setTimeout(() => {
      editorRegistry.prefetchOnFileListReady();
    }, 150);
  }, []);

  return onFileListReady;
}

/** Returns true if the URL hash requires the editor (not just the file list). */
function hashNeedsEditor(): boolean {
  return hashNeedsEditorRoute(window.location.hash);
}

function buildFileHash(id: string, kind?: string): string {
  return editorRegistry.buildFileHash(id, kind);
}

function debugMindMapOpen(label: string, data?: Record<string, unknown>) {
  devDebug("mindmap-open", label, data);
}

function debugApp(label: string, data?: Record<string, unknown>) {
  devDebug("app", label, {
    hash: window.location.hash,
    pathname: window.location.pathname,
    search: window.location.search,
    hasEmbedModeFlag: !!window.__EXCALIDRAW_EMBED_MODE__,
    hasEmbedBootstrap: !!window.__EXCALIDRAW_EMBED_BOOTSTRAP__,
    embedKind: window.__EXCALIDRAW_EMBED_BOOTSTRAP__?.kind,
    embedFileId8: window.__EXCALIDRAW_EMBED_BOOTSTRAP__?.fileId?.slice(0, 8),
    ...(data ?? {}),
  });
}

const UnsupportedDocumentFallback = ({ kind }: { kind: string }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      padding: 24,
      color: "var(--nb-text-muted, #868e96)",
      fontFamily: "var(--nb-font-ui, system-ui, sans-serif)",
    }}
  >
    <span>暂不支持打开 {kind} 文档，编辑器接入将在后续阶段完成。</span>
  </div>
);

/** File list home when URL has no `#file=`; editor mounts only after opening. */
const ForkRoot = () => {
  const [, bump] = useState(0);
  useEffect(() => {
    const h = () => {
      logFileListOpen("App hashchange (ForkRoot)", {
        hash: window.location.hash,
        needsEditor: hashNeedsEditor(),
      });
      bump((n) => n + 1);
    };
    window.addEventListener("hashchange", h);
    logFileListOpen("App ForkRoot mount", {
      hash: window.location.hash,
      needsEditor: hashNeedsEditor(),
    });
    return () => window.removeEventListener("hashchange", h);
  }, []);

  const needsEditor = hashNeedsEditor();
  const onFileListReady = useDeferredEditorPrefetch();
  const documentKind = getDocumentKindFromHash();

  useEffect(() => {
    if (!needsEditor || documentKind !== "mindmap") {
      return;
    }
    editorRegistry.getByKind("mindmap")?.loadEditorShell().catch(() => {});
  }, [needsEditor, documentKind]);

  if (!needsEditor) {
    return (
      <div className="excalidraw-app" style={{ height: "100%" }}>
        <FileList
          onOpenFile={({ id, kind }) => {
            recordRecentFileAccess(id);
            const resolvedKind = editorRegistry.resolveKind(kind);
            const next = buildFileHash(id, resolvedKind);
            if (resolvedKind === "mindmap") {
              debugMindMapOpen("App onOpenFile mindmap", {
                id8: id.slice(0, 8),
                nextHash: next,
              });
            }
            logFileListOpen("App onOpenFile → assign location.hash", {
              id8: id.slice(0, 8),
              kind: resolvedKind,
              nextHash: next,
            });
            window.location.hash = next;
            queueMicrotask(() => {
              logFileListOpen("App onOpenFile after microtask", {
                hash: window.location.hash,
                needsEditor: hashNeedsEditor(),
              });
            });
          }}
          onReady={onFileListReady}
        />
      </div>
    );
  }

  const editorDefinition = editorRegistry.getByKind(documentKind);
  if (!editorDefinition) {
    return <UnsupportedDocumentFallback kind={documentKind} />;
  }

  const LazyEditor = getLazyEditorShell(editorDefinition);
  if (!LazyEditor) {
    return <UnsupportedDocumentFallback kind={documentKind} />;
  }
  const documentFileId = getFileIdFromHash();
  const editorSessionKey = `${documentKind}:${documentFileId ?? "new"}`;

  return (
    <EditorPlatformShell key={editorSessionKey}>
      <Suspense fallback={<EditorShellChunkFallback editorKind={documentKind} />}>
        <LazyEditor />
      </Suspense>
    </EditorPlatformShell>
  );
};

const EmbedChunkFallback = () => {
  useEffect(() => {
    logEditorOpenPhase("shell_chunk", { stage: "embed_app" });
  }, []);
  return null;
};

const ExcalidrawApp = () => {
  const embedMode = isEmbedMode();
  debugApp("render root", { embedMode });
  if (embedMode) {
    debugApp("render LazyEmbedApp");
    return (
      <TopErrorBoundary>
        <Suspense fallback={<EmbedChunkFallback />}>
          <LazyEmbedApp />
        </Suspense>
      </TopErrorBoundary>
    );
  }

  return (
    <TopErrorBoundary>
      <Provider store={appJotaiStore}>
        <ForkRoot />
        <DebugModeTrigger />
      </Provider>
    </TopErrorBoundary>
  );
};

export default ExcalidrawApp;
