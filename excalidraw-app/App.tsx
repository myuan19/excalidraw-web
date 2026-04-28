import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";

import {
  Provider,
  appJotaiStore,
} from "./app-jotai";
import { TopErrorBoundary } from "./components/TopErrorBoundary";
import { FileList } from "./components/FileList";
import { debugLog } from "./data/debugLog";

import "./index.scss";

const LazyEditorShell = lazy(() => import("./EditorShell"));

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

/** File list home when URL has no `#file=`; editor mounts only after opening. */
const ForkRoot = () => {
  const [, bump] = useState(0);
  useEffect(() => {
    const h = () => {
      debugLog.fileListOpen("App hashchange (ForkRoot)", {
        hash: window.location.hash,
        needsEditor: hashNeedsEditor(),
      });
      bump((n) => n + 1);
    };
    window.addEventListener("hashchange", h);
    debugLog.fileListOpen("App ForkRoot mount", {
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
          onOpenFile={(id) => {
            const next = `#file=${id}`;
            debugLog.fileListOpen("App onOpenFile → assign location.hash", {
              id8: id.slice(0, 8),
              nextHash: next,
            });
            window.location.hash = next;
            queueMicrotask(() => {
              debugLog.fileListOpen("App onOpenFile after microtask", {
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

  return (
    <Suspense fallback={<EditorFallback />}>
      <LazyEditorShell />
    </Suspense>
  );
};

const ExcalidrawApp = () => {
  return (
    <TopErrorBoundary>
      <Provider store={appJotaiStore}>
        <ForkRoot />
      </Provider>
    </TopErrorBoundary>
  );
};

export default ExcalidrawApp;
