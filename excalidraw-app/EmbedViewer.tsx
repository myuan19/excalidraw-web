import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Excalidraw,
  ExcalidrawAPIProvider,
  useExcalidrawAPI,
} from "@excalidraw/excalidraw";
import { THEME } from "@excalidraw/common";
import { restoreAppState, restoreElements } from "@excalidraw/excalidraw/data/restore";

import type {
  ExcalidrawInitialDataState,
  AppState,
} from "@excalidraw/excalidraw/types";

import "./EmbedViewer.scss";

// ── Custom SVG icons (reference: Notion-Boost) ──────────────────────────────

const CrosshairIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
  </svg>
);

const PinIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
  </svg>
);

const ExternalLinkIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

declare global {
  interface Window {
    __EXCALIDRAW_EMBED_MODE__?: boolean;
    __EXCALIDRAW_EMBED_FILE_ID__?: string;
    __EXCALIDRAW_EMBED_FILE_NAME__?: string;
    __EXCALIDRAW_EMBED_DATA__?: {
      elements?: unknown[];
      appState?: Record<string, unknown>;
      files?: Record<string, unknown>;
    };
  }
}

export function isEmbedMode(): boolean {
  return !!window.__EXCALIDRAW_EMBED_MODE__;
}

function getEmbedInitialData(): ExcalidrawInitialDataState | null {
  const raw = window.__EXCALIDRAW_EMBED_DATA__;
  if (!raw || typeof raw !== "object") {
    return null;
  }

  return {
    elements: restoreElements((raw.elements as any) ?? [], null, {
      repairBindings: true,
      deleteInvisibleElements: true,
    }),
    appState: restoreAppState((raw.appState as any) ?? {}, null),
    files: (raw.files || {}) as any,
  };
}

// ── Inner canvas + controls (must be child of ExcalidrawAPIProvider) ─────────

interface DefaultViewport {
  scrollX: number;
  scrollY: number;
  zoom: number;
}

function embedDebug(event: string, data?: Record<string, unknown>): void {
  console.info("[embedViewer]", event, data ?? {});
}

function viewportFromAppState(appState: AppState): DefaultViewport {
  return {
    scrollX: appState.scrollX,
    scrollY: appState.scrollY,
    zoom: appState.zoom.value,
  };
}

function roundViewport(viewport: DefaultViewport | null): DefaultViewport | null {
  if (!viewport) {
    return null;
  }
  return {
    scrollX: Math.round(viewport.scrollX * 100) / 100,
    scrollY: Math.round(viewport.scrollY * 100) / 100,
    zoom: Math.round(viewport.zoom * 10000) / 10000,
  };
}

interface EmbedCanvasProps {
  initialData: ExcalidrawInitialDataState | null;
  theme: "light" | "dark";
  editUrl: string;
}

type ViewControlState =
  | "pinned-overview"
  | "free-overview"
  | "free-offset";

const EmbedCanvas = ({ initialData, theme, editUrl }: EmbedCanvasProps) => {
  const api = useExcalidrawAPI();
  const [isAtDefaultView, setIsAtDefaultView] = useState(true);
  const [isPinned, setIsPinned] = useState(true);
  const suppress = useRef(false);
  const justFitted = useRef(false);
  const defaultViewport = useRef<DefaultViewport | null>(null);
  const isAtDefaultViewRef = useRef(isAtDefaultView);
  const isPinnedRef = useRef(isPinned);
  const initialFitDone = useRef(false);

  const fitToOverview = useCallback(
    (nextPinned = true, source = "unknown") => {
      if (!api) {
        embedDebug("fit skipped: no api", { source, nextPinned });
        return;
      }
      const elements = api.getSceneElements();
      if (elements.length === 0) {
        embedDebug("fit skipped: empty scene", { source, nextPinned });
        setIsAtDefaultView(true);
        setIsPinned(nextPinned);
        return;
      }

      suppress.current = true;
      justFitted.current = true;

      const containerEl = document.querySelector(".excalidraw-embed-viewer");
      const canvasEl = containerEl?.querySelector(".excalidraw") as HTMLElement | null;
      const containerRect = containerEl?.getBoundingClientRect();
      const canvasRect = canvasEl?.getBoundingClientRect();

      const before = viewportFromAppState(api.getAppState());
      const sceneBounds = elements.reduce(
        (acc, el) => ({
          minX: Math.min(acc.minX, el.x),
          minY: Math.min(acc.minY, el.y),
          maxX: Math.max(acc.maxX, el.x + el.width),
          maxY: Math.max(acc.maxY, el.y + el.height),
        }),
        { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
      );
      embedDebug("fit start", {
        source,
        nextPinned,
        elementCount: elements.length,
        before: roundViewport(before),
        defaultViewport: roundViewport(defaultViewport.current),
        container: containerRect
          ? { w: Math.round(containerRect.width), h: Math.round(containerRect.height) }
          : null,
        canvas: canvasRect
          ? { w: Math.round(canvasRect.width), h: Math.round(canvasRect.height) }
          : null,
        sceneBounds: {
          w: Math.round(sceneBounds.maxX - sceneBounds.minX),
          h: Math.round(sceneBounds.maxY - sceneBounds.minY),
          minX: Math.round(sceneBounds.minX),
          minY: Math.round(sceneBounds.minY),
        },
        windowSize: { w: window.innerWidth, h: window.innerHeight },
      });
      api.scrollToContent(elements, { fitToContent: true, animate: false });

      const afterState = api.getAppState();
      defaultViewport.current = {
        scrollX: afterState.scrollX,
        scrollY: afterState.scrollY,
        zoom: afterState.zoom.value,
      };
      setIsAtDefaultView(true);
      setIsPinned(nextPinned);
      embedDebug("fit done", {
        source,
        nextPinned,
        after: roundViewport(defaultViewport.current),
        afterWidth: afterState.width,
        afterHeight: afterState.height,
      });

      setTimeout(() => {
        suppress.current = false;
        embedDebug("fit suppress released", {
          source,
          defaultViewport: roundViewport(defaultViewport.current),
        });
      }, 80);
    },
    [api],
  );

  // Track last known appState dimensions to detect resize
  const lastKnownSize = useRef<{ w: number; h: number } | null>(null);

  useEffect(() => {
    embedDebug("mounted", {
      fileId: window.__EXCALIDRAW_EMBED_FILE_ID__ ?? null,
      fileName: window.__EXCALIDRAW_EMBED_FILE_NAME__ ?? null,
      hasApi: !!api,
      hasInitialData: !!initialData,
      initialElementCount: initialData?.elements?.length ?? null,
      initialFileCount: initialData?.files
        ? Object.keys(initialData.files).length
        : 0,
      theme,
    });
  }, [api, initialData, theme]);

  // Re-fit when the container resizes (iframe gets its correct dimensions)
  useEffect(() => {
    if (!api) return;
    const container = document.querySelector(".excalidraw-embed-viewer");
    if (!container) return;

    let refitTimer: ReturnType<typeof setTimeout> | null = null;
    const mountTime = Date.now();

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const rounded = { w: Math.round(width), h: Math.round(height) };

      if (
        lastKnownSize.current &&
        lastKnownSize.current.w === rounded.w &&
        lastKnownSize.current.h === rounded.h
      ) {
        return;
      }

      const prev = lastKnownSize.current;
      lastKnownSize.current = rounded;

      if (!prev) return;

      const elapsed = Date.now() - mountTime;
      embedDebug("container resized", {
        from: prev,
        to: rounded,
        elapsed,
        willRefit: elapsed < 5000,
      });

      if (elapsed < 5000) {
        if (refitTimer) clearTimeout(refitTimer);
        refitTimer = setTimeout(() => {
          refitTimer = null;
          embedDebug("refit after resize", { size: rounded });
          fitToOverview(isPinnedRef.current, "resize-refit");
        }, 100);
      }
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
      if (refitTimer) clearTimeout(refitTimer);
    };
  }, [api, fitToOverview]);

  useEffect(() => {
    isAtDefaultViewRef.current = isAtDefaultView;
  }, [isAtDefaultView]);

  useEffect(() => {
    isPinnedRef.current = isPinned;
  }, [isPinned]);

  const viewControlState: ViewControlState = !isAtDefaultView
    ? "free-offset"
    : isPinned
      ? "pinned-overview"
      : "free-overview";

  const handleViewControl = useCallback(() => {
    embedDebug("view control clicked", {
      viewControlState,
      isAtDefaultView,
      isPinned,
      defaultViewport: roundViewport(defaultViewport.current),
    });
    if (viewControlState === "free-offset") {
      fitToOverview(false, "button-offset");
      return;
    }
    setIsPinned((current) => {
      const nextPinned = !current;
      embedDebug("pin toggled", {
        from: current,
        to: nextPinned,
        viewControlState,
      });
      return nextPinned;
    });
  }, [fitToOverview, isAtDefaultView, isPinned, viewControlState]);

  const handleChange = useCallback(
    (_elements: unknown, appState: AppState) => {
      const currentViewport = viewportFromAppState(appState);
      if (suppress.current) {
        embedDebug("onChange ignored: suppress", {
          current: roundViewport(currentViewport),
          defaultViewport: roundViewport(defaultViewport.current),
        });
        return;
      }
      if (!initialFitDone.current) {
        initialFitDone.current = true;
        embedDebug("onChange initial fit trigger", {
          current: roundViewport(currentViewport),
          elementCount: api?.getSceneElements().length ?? null,
        });
        fitToOverview(true, "initial-onChange");
        return;
      }
      if (!defaultViewport.current) {
        defaultViewport.current = currentViewport;
        embedDebug("onChange default viewport initialized", {
          current: roundViewport(currentViewport),
        });
        setIsAtDefaultView(true);
        return;
      }
      // After a fit, recalibrate on the first onChange regardless of pin state
      if (justFitted.current) {
        justFitted.current = false;
        defaultViewport.current = currentViewport;
        embedDebug("onChange recalibrated after fit", {
          nextDefaultViewport: roundViewport(currentViewport),
        });
        if (!isAtDefaultViewRef.current) {
          setIsAtDefaultView(true);
        }
        return;
      }

      const dv = defaultViewport.current;
      const delta = {
        scrollX: Math.round((appState.scrollX - dv.scrollX) * 100) / 100,
        scrollY: Math.round((appState.scrollY - dv.scrollY) * 100) / 100,
        zoom: Math.round((appState.zoom.value - dv.zoom) * 10000) / 10000,
      };
      const moved =
        Math.abs(appState.scrollX - dv.scrollX) > 1 ||
        Math.abs(appState.scrollY - dv.scrollY) > 1 ||
        Math.abs(appState.zoom.value - dv.zoom) > 0.005;

      if (moved) {
        if (isPinnedRef.current && isAtDefaultViewRef.current) {
          defaultViewport.current = currentViewport;
          embedDebug("onChange recalibrated pinned overview", {
            nextDefaultViewport: roundViewport(currentViewport),
          });
          return;
        }
        if (!isAtDefaultViewRef.current) {
          return;
        }
        embedDebug("onChange state -> free-offset", {
          current: roundViewport(currentViewport),
          defaultViewport: roundViewport(dv),
          delta,
        });
        setIsAtDefaultView(false);
      } else {
        if (isAtDefaultViewRef.current) {
          return;
        }
        embedDebug("onChange state -> overview", {
          current: roundViewport(currentViewport),
        });
        setIsAtDefaultView(true);
      }
    },
    [api, fitToOverview],
  );

  const isOffset = viewControlState === "free-offset";
  const lockInteraction = isPinned && isAtDefaultView;
  const viewControlLabel =
    viewControlState === "free-offset"
      ? "适配视图"
      : viewControlState === "pinned-overview"
        ? "取消钉住"
        : "钉住视图";

  return (
    <>
      <Excalidraw
        initialData={initialData}
        viewModeEnabled={true}
        zenModeEnabled={true}
        isCollaborating={false}
        theme={theme}
        onChange={handleChange}
        UIOptions={{
          canvasActions: {
            toggleTheme: false,
            export: false,
            saveAsImage: false,
            loadScene: false,
            clearCanvas: false,
            saveToActiveFile: false,
            changeViewBackgroundColor: false,
          },
        }}
        detectScroll={false}
        handleKeyboardGlobally={false}
      />
      {lockInteraction && <div className="embed-viewer-interaction-lock" />}
      <div className="embed-viewer-controls">
        <button
          className={[
            "embed-viewer-btn",
            "embed-viewer-btn--view",
            viewControlState === "pinned-overview"
              ? "embed-viewer-btn--active"
              : "",
          ].filter(Boolean).join(" ")}
          data-state={viewControlState}
          onClick={handleViewControl}
          title={viewControlLabel}
          aria-label={viewControlLabel}
          type="button"
        >
          {isOffset ? CrosshairIcon : PinIcon}
        </button>
        <a
          className="embed-viewer-btn embed-viewer-btn--share"
          href={editUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="打开编辑页"
          aria-label="打开编辑页"
        >
          {ExternalLinkIcon}
        </a>
      </div>
    </>
  );
};

// ── Public component ──────────────────────────────────────────────────────────

const EmbedViewer = () => {
  const initialData = getEmbedInitialData();

  const theme =
    (initialData?.appState as any)?.theme === "dark" ? THEME.DARK : THEME.LIGHT;

  const fileId = window.__EXCALIDRAW_EMBED_FILE_ID__;
  const editUrl = fileId
    ? `${window.location.origin}/#file=${fileId}`
    : window.location.origin;

  return (
    <div className="excalidraw-embed-viewer">
      <ExcalidrawAPIProvider>
        <EmbedCanvas initialData={initialData} theme={theme} editUrl={editUrl} />
      </ExcalidrawAPIProvider>
    </div>
  );
};

export default EmbedViewer;
