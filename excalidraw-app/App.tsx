import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";

import {
  Provider,
  appJotaiStore,
} from "./app-jotai";
import { TopErrorBoundary } from "./components/TopErrorBoundary";
import { FileList } from "./components/FileList";
import { logFileListOpen } from "./lib/logger";
import { isEmbedMode } from "./embed/embedMode";

import "./index.scss";

const LazyEditorShell = lazy(() => import("./EditorShell"));
const LazyEmbedApp = lazy(() => import("./embed/EmbedApp"));
const LazyMindMapEditorShell = lazy(() => import("./MindMapEditorShell"));

const EditorFallback = () => (
  <div className="editor-loading-fallback">
    <div className="editor-loading-spinner" />
    <span>加载编辑器…</span>
  </div>
);

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
      import("./EditorShell").catch(() => {});
    }, 150);
  }, []);

  return onFileListReady;
}

/** Returns true if the URL hash requires the editor (not just the file list). */
function hashNeedsEditor(): boolean {
  const h = window.location.hash;
  return h.startsWith("#file=") || h.startsWith("#addLibrary=");
}

function getDocumentKindFromHash(): string {
  const params = new URLSearchParams(window.location.hash.slice(1));
  return params.get("kind") || "excalidraw";
}

function buildFileHash(id: string, kind = "excalidraw"): string {
  const params = new URLSearchParams();
  params.set("file", id);
  if (kind !== "excalidraw") {
    params.set("kind", kind);
  }
  return `#${params.toString()}`;
}

function debugMindMapOpen(label: string, data?: Record<string, unknown>) {
  if (typeof performance === "undefined") {
    console.log(`[DEBUG] mindmap-open | ${label}`, data ?? {});
    return;
  }
  console.log(`[DEBUG] mindmap-open | ${label}`, {
    t: Math.round(performance.now()),
    ...(data ?? {}),
  });
}

function debugApp(label: string, data?: Record<string, unknown>) {
  console.info(`[DEBUG] App | ${label}`, {
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
  <div className="editor-loading-fallback">
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

  if (!needsEditor) {
    return (
      <div className="excalidraw-app" style={{ height: "100%" }}>
        <FileList
          onOpenFile={({ id, kind = "excalidraw" }) => {
            const next = buildFileHash(id, kind);
            if (kind === "mindmap") {
              debugMindMapOpen("App onOpenFile mindmap", {
                id8: id.slice(0, 8),
                nextHash: next,
              });
            }
            logFileListOpen("App onOpenFile → assign location.hash", {
              id8: id.slice(0, 8),
              kind,
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

  const documentKind = getDocumentKindFromHash();
  if (documentKind === "mindmap") {
    debugMindMapOpen("App render LazyMindMapEditorShell", {
      hash: window.location.hash,
    });
    return (
      <Suspense fallback={<EditorFallback />}>
        <LazyMindMapEditorShell />
      </Suspense>
    );
  }

  if (documentKind !== "excalidraw") {
    return <UnsupportedDocumentFallback kind={documentKind} />;
  }

  return (
    <Suspense fallback={<EditorFallback />}>
      <LazyEditorShell />
    </Suspense>
  );
};

const EmbedFallback = () => (
  <div style={{
    display: "flex", alignItems: "center", justifyContent: "center",
    height: "100%", fontFamily: "system-ui, sans-serif", color: "#868e96",
  }}>
    加载嵌入画布…
  </div>
);

const ExcalidrawApp = () => {
  const embedMode = isEmbedMode();
  debugApp("render root", { embedMode });
  if (embedMode) {
    debugApp("render LazyEmbedApp");
    return (
      <TopErrorBoundary>
        <Suspense fallback={<EmbedFallback />}>
          <LazyEmbedApp />
        </Suspense>
      </TopErrorBoundary>
    );
  }

  return (
    <TopErrorBoundary>
      <Provider store={appJotaiStore}>
        <ForkRoot />
      </Provider>
    </TopErrorBoundary>
  );
};

export default ExcalidrawApp;
