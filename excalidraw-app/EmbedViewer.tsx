import { useCallback, useEffect, useRef, useState } from "react";
import {
  Excalidraw,
  ExcalidrawAPIProvider,
  useExcalidrawAPI,
} from "@excalidraw/excalidraw";
import { THEME } from "@excalidraw/common";
import {
  restoreAppState,
  restoreElements,
} from "@excalidraw/excalidraw/data/restore";
import {
  buildMindMapEmbedBridgePayload,
  buildEmbedEditUrl,
  getEmbedDocumentKind,
  getMindMapEmbedData,
  type EmbedDocumentKind,
} from "./data/embedDocument";
import { handleEmbedEditLinkClick } from "./embed/openEmbedEditUrl";

import type {
  ExcalidrawInitialDataState,
  AppState,
} from "@excalidraw/excalidraw/types";

import "./EmbedViewer.scss";

// ── Custom SVG icons (reference: Notion-Boost) ──────────────────────────────

const CrosshairIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
  </svg>
);

const ExternalLinkIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
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
    __EXCALIDRAW_EMBED_KIND__?: string;
    __EXCALIDRAW_EMBED_DATA__?: unknown;
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
  const scene = raw as {
    elements?: unknown[];
    appState?: Record<string, unknown>;
    files?: Record<string, unknown>;
  };

  return {
    elements: restoreElements((scene.elements as any) ?? [], null, {
      repairBindings: true,
      deleteInvisibleElements: true,
    }),
    appState: restoreAppState((scene.appState as any) ?? {}, null),
    files: (scene.files || {}) as any,
    scrollToContent: true,
  };
}

function getEmbedResourceTokenQuery(): string {
  const token = new URLSearchParams(window.location.search).get("token");
  return token ? `?_t=${encodeURIComponent(token)}` : "";
}

// ── Inner canvas + controls (must be child of ExcalidrawAPIProvider) ─────────

interface DefaultViewport {
  scrollX: number;
  scrollY: number;
  zoom: number;
}

function embedDebug(event: string, data?: Record<string, unknown>): void {
  try {
    console.info(`[DEBUG] embedViewer | ${event} ${JSON.stringify(data ?? {})}`);
  } catch {
    console.info(`[DEBUG] embedViewer | ${event}`, data ?? {});
  }
}

function viewportFromAppState(appState: AppState): DefaultViewport {
  return {
    scrollX: appState.scrollX,
    scrollY: appState.scrollY,
    zoom: appState.zoom.value,
  };
}

function viewportFromUnknownAppState(appState: unknown): DefaultViewport | null {
  if (!appState || typeof appState !== "object") {
    return null;
  }
  const state = appState as {
    scrollX?: unknown;
    scrollY?: unknown;
    zoom?: { value?: unknown } | unknown;
  };
  const scrollX = typeof state.scrollX === "number" ? state.scrollX : null;
  const scrollY = typeof state.scrollY === "number" ? state.scrollY : null;
  const zoomValue =
    state.zoom && typeof state.zoom === "object"
      ? (state.zoom as { value?: unknown }).value
      : null;
  if (
    scrollX === null ||
    scrollY === null ||
    typeof zoomValue !== "number"
  ) {
    return null;
  }
  return { scrollX, scrollY, zoom: zoomValue };
}

function roundViewport(
  viewport: DefaultViewport | null,
): DefaultViewport | null {
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

type DefaultViewportSource = "current" | "preview-range";

const EmbedCanvas = ({ initialData, theme, editUrl }: EmbedCanvasProps) => {
  const api = useExcalidrawAPI();
  const [isAtDefaultView, setIsAtDefaultView] = useState(true);
  const suppress = useRef(false);
  const justFitted = useRef(false);
  const defaultViewport = useRef<DefaultViewport | null>(null);
  const defaultViewportSource = useRef<DefaultViewportSource>("current");
  const isAtDefaultViewRef = useRef(isAtDefaultView);
  const initialFitDone = useRef(false);

  const applyExcalidrawPreviewRange = useCallback(
    (source = "unknown") => {
      if (!api) {
        embedDebug("preview range skipped: no api", { source });
        return;
      }
      const elements = api.getSceneElements();
      if (elements.length === 0) {
        embedDebug("preview range skipped: empty scene", { source });
        setIsAtDefaultView(true);
        return;
      }

      suppress.current = true;
      justFitted.current = true;

      const containerEl = document.querySelector(".excalidraw-embed-viewer");
      const canvasEl = containerEl?.querySelector(
        ".excalidraw",
      ) as HTMLElement | null;
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
      embedDebug("preview range apply start", {
        source,
        elementCount: elements.length,
        before: roundViewport(before),
        defaultViewport: roundViewport(defaultViewport.current),
        container: containerRect
          ? {
              w: Math.round(containerRect.width),
              h: Math.round(containerRect.height),
            }
          : null,
        canvas: canvasRect
          ? {
              w: Math.round(canvasRect.width),
              h: Math.round(canvasRect.height),
            }
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
      defaultViewportSource.current = "preview-range";
      setIsAtDefaultView(true);
      embedDebug("preview range apply done", {
        source,
        after: roundViewport(defaultViewport.current),
        afterWidth: afterState.width,
        afterHeight: afterState.height,
      });

      setTimeout(() => {
        suppress.current = false;
        embedDebug("preview range suppress released", {
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
    const containerEl = document.querySelector(".excalidraw-embed-viewer");
    const canvasEl = containerEl?.querySelector(
      ".excalidraw",
    ) as HTMLElement | null;
    const containerRect = containerEl?.getBoundingClientRect();
    const canvasRect = canvasEl?.getBoundingClientRect();
    embedDebug("mounted", {
      fileId: window.__EXCALIDRAW_EMBED_FILE_ID__ ?? null,
      fileName: window.__EXCALIDRAW_EMBED_FILE_NAME__ ?? null,
      hasApi: !!api,
      hasInitialData: !!initialData,
      initialElementCount: initialData?.elements?.length ?? null,
      initialFileCount: initialData?.files
        ? Object.keys(initialData.files).length
        : 0,
      initialViewport: initialData?.appState
        ? roundViewport(viewportFromUnknownAppState(initialData.appState))
        : null,
      container: containerRect
        ? {
            w: Math.round(containerRect.width),
            h: Math.round(containerRect.height),
          }
        : null,
      canvas: canvasRect
        ? {
            w: Math.round(canvasRect.width),
            h: Math.round(canvasRect.height),
          }
        : null,
      windowSize: { w: window.innerWidth, h: window.innerHeight },
      theme,
    });
    requestAnimationFrame(() => {
      const appState = api?.getAppState();
      const nextContainerRect = containerEl?.getBoundingClientRect();
      const nextCanvasRect = canvasEl?.getBoundingClientRect();
      embedDebug("after first animation frame", {
        viewport: appState ? roundViewport(viewportFromAppState(appState)) : null,
        container: nextContainerRect
          ? {
              w: Math.round(nextContainerRect.width),
              h: Math.round(nextContainerRect.height),
            }
          : null,
        canvas: nextCanvasRect
          ? {
              w: Math.round(nextCanvasRect.width),
              h: Math.round(nextCanvasRect.height),
            }
          : null,
      });
    });
    const timer = window.setTimeout(() => {
      const appState = api?.getAppState();
      const nextContainerRect = containerEl?.getBoundingClientRect();
      const nextCanvasRect = canvasEl?.getBoundingClientRect();
      embedDebug("after 800ms", {
        viewport: appState ? roundViewport(viewportFromAppState(appState)) : null,
        defaultViewport: roundViewport(defaultViewport.current),
        defaultViewportSource: defaultViewportSource.current,
        container: nextContainerRect
          ? {
              w: Math.round(nextContainerRect.width),
              h: Math.round(nextContainerRect.height),
            }
          : null,
        canvas: nextCanvasRect
          ? {
              w: Math.round(nextCanvasRect.width),
              h: Math.round(nextCanvasRect.height),
            }
          : null,
      });
    }, 800);
    return () => window.clearTimeout(timer);
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
        defaultViewportSource: defaultViewportSource.current,
        willRefit:
          elapsed < 5000 &&
          defaultViewportSource.current === "preview-range",
      });

      if (
        elapsed < 5000 &&
        defaultViewportSource.current === "preview-range"
      ) {
        if (refitTimer) clearTimeout(refitTimer);
        refitTimer = setTimeout(() => {
          refitTimer = null;
          embedDebug("refit after resize", { size: rounded });
          applyExcalidrawPreviewRange("resize-refit");
        }, 100);
      }
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
      if (refitTimer) clearTimeout(refitTimer);
    };
  }, [api, applyExcalidrawPreviewRange]);

  useEffect(() => {
    if (!api) {
      return;
    }
    const onMessage = (event: MessageEvent<unknown>) => {
      const message = event.data as { type?: unknown } | null;
      if (!message || typeof message !== "object") {
        return;
      }
      if (message.type !== "EMBED_LOCATE" && message.type !== "EMBED_REFIT") {
        return;
      }
      const appState = api.getAppState();
      embedDebug("host locate/refit message received", {
        type: message.type,
        origin: event.origin,
        viewport: roundViewport(viewportFromAppState(appState)),
        defaultViewport: roundViewport(defaultViewport.current),
        defaultViewportSource: defaultViewportSource.current,
        isAtDefaultView: isAtDefaultViewRef.current,
      });
      applyExcalidrawPreviewRange(
        message.type === "EMBED_LOCATE" ? "host-embed-locate" : "host-embed-refit",
      );
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [api, applyExcalidrawPreviewRange]);

  useEffect(() => {
    isAtDefaultViewRef.current = isAtDefaultView;
  }, [isAtDefaultView]);

  const handleViewControl = useCallback(() => {
    embedDebug("locate button clicked", {
      isAtDefaultView,
      defaultViewport: roundViewport(defaultViewport.current),
    });
    applyExcalidrawPreviewRange("button-locate");
  }, [applyExcalidrawPreviewRange, isAtDefaultView]);

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
        embedDebug("onChange initial viewport; fitting to preview range", {
          current: roundViewport(currentViewport),
          elementCount: api?.getSceneElements().length ?? null,
        });
        applyExcalidrawPreviewRange("initial-load");
        return;
      }
      if (!defaultViewport.current) {
        defaultViewport.current = currentViewport;
        defaultViewportSource.current = "current";
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
        defaultViewportSource.current = "preview-range";
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
    [api, applyExcalidrawPreviewRange],
  );

  const viewControlState = isAtDefaultView ? "overview" : "free-offset";
  const viewControlLabel = "定位";

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
      <div className="embed-viewer-controls">
        <button
          className="embed-viewer-btn embed-viewer-btn--view"
          data-state={viewControlState}
          onClick={handleViewControl}
          title={viewControlLabel}
          aria-label={viewControlLabel}
          type="button"
        >
          {CrosshairIcon}
        </button>
        <a
          className="embed-viewer-btn embed-viewer-btn--share"
          href={editUrl}
          onClick={(event) => handleEmbedEditLinkClick(event, editUrl)}
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

const MindMapEmbedViewer = ({
  data,
  editUrl,
}: {
  data: ReturnType<typeof getMindMapEmbedData>;
  editUrl: string;
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [isReady, setIsReady] = useState(false);

  const getFrameDebugInfo = useCallback(() => {
    const container = document.querySelector(".mindmap-embed-viewer");
    const iframe = iframeRef.current;
    const containerRect = container?.getBoundingClientRect();
    const iframeRect = iframe?.getBoundingClientRect();
    return {
      container: containerRect
        ? {
            w: Math.round(containerRect.width),
            h: Math.round(containerRect.height),
            x: Math.round(containerRect.x),
            y: Math.round(containerRect.y),
          }
        : null,
      iframe: iframeRect
        ? {
            w: Math.round(iframeRect.width),
            h: Math.round(iframeRect.height),
            x: Math.round(iframeRect.x),
            y: Math.round(iframeRect.y),
          }
        : null,
      isReady,
      iframeSrc: iframe?.getAttribute("src") ?? null,
    };
  }, [isReady]);

  const postInit = useCallback(() => {
    embedDebug("mindmap post init", {
      ...getFrameDebugInfo(),
      rootChildren: data.root?.children?.length ?? 0,
      hasView: !!data.view,
    });
    iframeRef.current?.contentWindow?.postMessage(
      {
        source: "excalidraw-web",
        type: "initMindMap",
        payload: buildMindMapEmbedBridgePayload(data),
      },
      window.location.origin,
    );
  }, [data, getFrameDebugInfo]);

  const applyMindMapPreviewRange = useCallback(() => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    embedDebug("mindmap preview range button clicked", {
      requestId,
      ...getFrameDebugInfo(),
      hasInitialView: !!data.view,
    });
    iframeRef.current?.contentWindow?.postMessage(
      {
        source: "excalidraw-web",
        type: "restoreMindMapView",
        payload: { requestId, reason: "embed-button" },
      },
      window.location.origin,
    );
  }, [data.view, getFrameDebugInfo]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      const message = event.data as { source?: unknown; type?: unknown };
      if (
        message?.source === "simple-mind-map-native" &&
        message.type === "ready"
      ) {
        embedDebug("mindmap iframe ready", getFrameDebugInfo());
        setIsReady(true);
        postInit();
        return;
      }
      if (
        message?.source === "simple-mind-map-native" &&
        message.type === "appInited"
      ) {
        embedDebug("mindmap iframe appInited", getFrameDebugInfo());
        return;
      }
      if (
        message?.source === "simple-mind-map-native" &&
        message.type === "mindMapScaleState"
      ) {
        embedDebug("mindmap iframe scale", {
          ...getFrameDebugInfo(),
          payload: (message as { payload?: unknown }).payload ?? null,
        });
        return;
      }
      if (
        message?.source === "simple-mind-map-native" &&
        message.type === "mindMapViewRestoreDone"
      ) {
        embedDebug("mindmap iframe view restore done", {
          ...getFrameDebugInfo(),
          payload: (message as { payload?: unknown }).payload ?? null,
        });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [getFrameDebugInfo, postInit]);

  useEffect(() => {
    const container = document.querySelector(".mindmap-embed-viewer");
    if (!container) {
      return;
    }
    let lastSize: { w: number; h: number } | null = null;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const size = {
        w: Math.round(entry.contentRect.width),
        h: Math.round(entry.contentRect.height),
      };
      if (lastSize && lastSize.w === size.w && lastSize.h === size.h) {
        return;
      }
      embedDebug("mindmap container resized", {
        from: lastSize,
        to: size,
        ...getFrameDebugInfo(),
      });
      lastSize = size;
    });
    observer.observe(container);
    requestAnimationFrame(() => {
      embedDebug("mindmap after first animation frame", getFrameDebugInfo());
    });
    const timer = window.setTimeout(() => {
      embedDebug("mindmap after 800ms", getFrameDebugInfo());
    }, 800);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [getFrameDebugInfo]);

  return (
    <div className="mindmap-embed-viewer">
      <iframe
        ref={iframeRef}
        title="MindMap"
        className="mindmap-embed-viewer__frame"
        src={`/embed/mind-map/index.html${getEmbedResourceTokenQuery()}`}
        onLoad={() => embedDebug("mindmap iframe load", getFrameDebugInfo())}
      />
      <div className="embed-viewer-controls">
        <button
          className="embed-viewer-btn embed-viewer-btn--view"
          data-state="free-offset"
          onClick={applyMindMapPreviewRange}
          title="定位"
          aria-label="定位"
          type="button"
        >
          {CrosshairIcon}
        </button>
        <a
          className="embed-viewer-btn embed-viewer-btn--share"
          href={editUrl}
          onClick={(event) => handleEmbedEditLinkClick(event, editUrl)}
          target="_blank"
          rel="noopener noreferrer"
          title="打开编辑页"
          aria-label="打开编辑页"
        >
          {ExternalLinkIcon}
        </a>
      </div>
    </div>
  );
};

// ── Public component ──────────────────────────────────────────────────────────

const EmbedViewer = () => {
  const kind: EmbedDocumentKind = getEmbedDocumentKind(
    window.__EXCALIDRAW_EMBED_KIND__,
  );
  const fileId = window.__EXCALIDRAW_EMBED_FILE_ID__;
  const editUrl = buildEmbedEditUrl(fileId, kind);

  if (kind === "mindmap") {
    try {
      const mindMapData = getMindMapEmbedData(window.__EXCALIDRAW_EMBED_DATA__);
      return <MindMapEmbedViewer data={mindMapData} editUrl={editUrl} />;
    } catch (error) {
      return (
        <div className="excalidraw-embed-viewer excalidraw-embed-viewer--error">
          MindMap 嵌入数据无效
        </div>
      );
    }
  }

  const initialData = getEmbedInitialData();

  const theme =
    (initialData?.appState as any)?.theme === "dark" ? THEME.DARK : THEME.LIGHT;

  return (
    <div className="excalidraw-embed-viewer">
      <ExcalidrawAPIProvider>
        <EmbedCanvas
          initialData={initialData}
          theme={theme}
          editUrl={editUrl}
        />
      </ExcalidrawAPIProvider>
    </div>
  );
};

export default EmbedViewer;
