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

import { getExcalidrawEmbedData } from "../data/embedDocument";
import { CrosshairIcon, PinIcon, ExternalLinkIcon } from "./icons";
import { handleEmbedEditLinkClick } from "./openEmbedEditUrl";
import {
  embedDebug,
  embedMark,
  embedMeasure,
  roundViewport,
  type DefaultViewport,
} from "./embedDebug";
import { useEmbedPinState, useEmbedAutoLock } from "./EmbedFocusGate";

import type {
  AppState,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";

import "../EmbedViewer.scss";

type DefaultViewportSource = "current" | "preview-range";

function summarizeRaw(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return { type: raw === null ? "null" : typeof raw };
  }
  const record = raw as Record<string, unknown>;
  const data =
    record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : null;
  return {
    keys: Object.keys(record).slice(0, 12),
    kind: record.kind ?? null,
    topElements: Array.isArray(record.elements) ? record.elements.length : null,
    dataKind: data?.kind ?? null,
    dataElements: data && Array.isArray(data.elements) ? data.elements.length : null,
    wrappedElements:
      data?.data &&
      typeof data.data === "object" &&
      Array.isArray((data.data as Record<string, unknown>).elements)
        ? ((data.data as Record<string, unknown>).elements as unknown[]).length
        : null,
  };
}

function getEmbedInitialData(raw: unknown): ExcalidrawInitialDataState | null {
  embedDebug("excalidraw getEmbedInitialData input", summarizeRaw(raw));
  if (!raw) {
    embedDebug("excalidraw getEmbedInitialData empty");
    return null;
  }
  let scene;
  try {
    scene = getExcalidrawEmbedData(raw);
  } catch (error) {
    embedDebug("excalidraw getEmbedInitialData parse failed", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
      raw: summarizeRaw(raw),
    });
    throw error;
  }
  embedDebug("excalidraw getEmbedInitialData scene", {
    elements: Array.isArray(scene.elements) ? scene.elements.length : 0,
    appStateKeys: scene.appState ? Object.keys(scene.appState).slice(0, 12) : [],
    files: scene.files ? Object.keys(scene.files).length : 0,
  });

  const initialData = {
    elements: restoreElements((scene.elements as any) ?? [], null, {
      repairBindings: true,
      deleteInvisibleElements: true,
    }),
    appState: restoreAppState((scene.appState as any) ?? {}, null),
    files: (scene.files || {}) as any,
    scrollToContent: true,
  };
  embedDebug("excalidraw getEmbedInitialData restored", {
    restoredElements: initialData.elements?.length ?? 0,
    appStateKeys: initialData.appState
      ? Object.keys(initialData.appState).slice(0, 12)
      : [],
    files: initialData.files ? Object.keys(initialData.files).length : 0,
  });
  return initialData;
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

type ViewControlState = "pinned-overview" | "free-overview" | "free-offset";

const EmbedCanvas = ({
  initialData,
  editUrl,
  theme,
}: {
  initialData: ExcalidrawInitialDataState | null;
  editUrl: string;
  theme: "light" | "dark";
}) => {
  const api = useExcalidrawAPI();
  const [isAtDefaultView, setIsAtDefaultView] = useState(true);
  const suppress = useRef(false);
  const justFitted = useRef(false);
  const defaultViewport = useRef<DefaultViewport | null>(null);
  const defaultViewportSource = useRef<DefaultViewportSource>("current");
  const isAtDefaultViewRef = useRef(isAtDefaultView);
  const initialFitDone = useRef(false);
  const firstChangeMarked = useRef(false);

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

  const pinState = useEmbedPinState();
  const containerRef = useRef<HTMLDivElement>(null);
  useEmbedAutoLock(pinState.isPinned, pinState.pin, containerRef);

  const lastKnownSize = useRef<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const containerEl = document.querySelector(".excalidraw-embed-viewer");
    const canvasEl = containerEl?.querySelector(
      ".excalidraw",
    ) as HTMLElement | null;
    const containerRect = containerEl?.getBoundingClientRect();
    const canvasRect = canvasEl?.getBoundingClientRect();
    embedDebug("mounted", {
      fileId: window.__EXCALIDRAW_EMBED_BOOTSTRAP__?.fileId ?? null,
      fileName: window.__EXCALIDRAW_EMBED_BOOTSTRAP__?.fileName ?? null,
      hasApi: !!api,
      hasInitialData: !!initialData,
      initialElementCount: initialData?.elements?.length ?? null,
      initialFileCount: initialData?.files ? Object.keys(initialData.files).length : 0,
      initialViewport: initialData?.appState
        ? roundViewport(viewportFromUnknownAppState(initialData.appState))
        : null,
      container: containerRect
        ? { w: Math.round(containerRect.width), h: Math.round(containerRect.height) }
        : null,
      canvas: canvasRect
        ? { w: Math.round(canvasRect.width), h: Math.round(canvasRect.height) }
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
          ? { w: Math.round(nextContainerRect.width), h: Math.round(nextContainerRect.height) }
          : null,
        canvas: nextCanvasRect
          ? { w: Math.round(nextCanvasRect.width), h: Math.round(nextCanvasRect.height) }
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
          ? { w: Math.round(nextContainerRect.width), h: Math.round(nextContainerRect.height) }
          : null,
        canvas: nextCanvasRect
          ? { w: Math.round(nextCanvasRect.width), h: Math.round(nextCanvasRect.height) }
          : null,
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [api, initialData, theme]);

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
    const viewState: ViewControlState = !isAtDefaultView
      ? "free-offset"
      : pinState.isPinned
        ? "pinned-overview"
        : "free-overview";
    embedDebug("view control clicked", {
      viewState,
      isAtDefaultView,
      isPinned: pinState.isPinned,
      defaultViewport: roundViewport(defaultViewport.current),
    });
    if (viewState === "free-offset") {
      applyExcalidrawPreviewRange("button-locate");
      return;
    }
    pinState.togglePin();
  }, [applyExcalidrawPreviewRange, isAtDefaultView, pinState]);

  const handleChange = useCallback(
    (_elements: unknown, appState: AppState) => {
      const currentViewport = viewportFromAppState(appState);
      if (!firstChangeMarked.current) {
        firstChangeMarked.current = true;
        embedMark("excalidraw-first-change");
        embedMeasure("entry-to-excalidraw-first-change", "entry-start", "excalidraw-first-change");
        embedDebug("excalidraw first onChange", {
          elements: Array.isArray(_elements) ? _elements.length : null,
          sceneElementsFromApi: api?.getSceneElements().length ?? null,
          viewport: roundViewport(currentViewport),
          appStateSize: { w: appState.width, h: appState.height },
        });
      }
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
        if (pinState.isPinnedRef.current && isAtDefaultViewRef.current) {
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
    [api, applyExcalidrawPreviewRange, pinState.isPinnedRef],
  );

  const viewControlState: ViewControlState = !isAtDefaultView
    ? "free-offset"
    : pinState.isPinned
      ? "pinned-overview"
      : "free-overview";

  const viewControlLabel =
    viewControlState === "free-offset"
      ? "定位"
      : viewControlState === "pinned-overview"
        ? "取消钉住"
        : "钉住视图";

  const lockInteraction = pinState.isPinned;

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%" }}>
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
      {lockInteraction && (
        <div
          className="embed-viewer-interaction-lock"
          onClick={(e) => {
            e.stopPropagation();
            pinState.unpin();
          }}
        />
      )}
      <div className="embed-viewer-controls">
        <button
          className="embed-viewer-btn embed-viewer-btn--view"
          data-state={viewControlState}
          onClick={handleViewControl}
          title={viewControlLabel}
          aria-label={viewControlLabel}
          type="button"
        >
          {viewControlState === "free-offset" ? CrosshairIcon : PinIcon}
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

export default function ExcalidrawEmbedViewer({
  data,
  editUrl,
}: {
  data: unknown;
  editUrl: string;
}) {
  embedDebug("excalidraw viewer render start", {
    data: summarizeRaw(data),
    editUrl,
  });
  const initialData = getEmbedInitialData(data);
  const theme =
    (initialData?.appState as any)?.theme === "dark" ? THEME.DARK : THEME.LIGHT;
  embedDebug("excalidraw viewer initial data ready", {
    elements: initialData?.elements?.length ?? null,
    files: initialData?.files ? Object.keys(initialData.files).length : 0,
    theme,
    scrollToContent: initialData?.scrollToContent === true,
  });

  return (
    <div className="excalidraw-embed-viewer">
      <ExcalidrawAPIProvider>
        <EmbedCanvas initialData={initialData} editUrl={editUrl} theme={theme} />
      </ExcalidrawAPIProvider>
    </div>
  );
}
