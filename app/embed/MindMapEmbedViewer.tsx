import { useCallback, useEffect, useRef, useState } from "react";

import {
  buildMindMapEmbedBridgePayload,
  getMindMapEmbedData,
} from "../data/embedDocument";
import { CrosshairIcon, ExternalLinkIcon } from "./icons";
import { embedDebug, embedMark, embedMeasure } from "./embedDebug";
import { getEmbedBootstrap } from "./embedMode";
import { handleEmbedEditLinkClick } from "./openEmbedEditUrl";
import { useEmbedPinState, useEmbedIframeAutoLock } from "./EmbedFocusGate";

import "../EmbedViewer.scss";

export interface MindMapViewport {
  scale: number;
  x: number;
  y: number;
}

function roundMmViewport(
  v: MindMapViewport | null,
): MindMapViewport | null {
  if (!v) {
    return null;
  }
  return {
    scale: Math.round(v.scale * 10000) / 10000,
    x: Math.round(v.x * 100) / 100,
    y: Math.round(v.y * 100) / 100,
  };
}

function numberFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" ? value : null;
}

export function getMindMapViewportFromPayload(
  payload: unknown,
): MindMapViewport | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const flatViewport = {
    scale: numberFromRecord(record, "scale"),
    x: numberFromRecord(record, "x"),
    y: numberFromRecord(record, "y"),
  };
  if (
    flatViewport.scale !== null &&
    flatViewport.x !== null &&
    flatViewport.y !== null
  ) {
    return flatViewport as MindMapViewport;
  }

  const state = record.state;
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return null;
  }
  const stateRecord = state as Record<string, unknown>;
  const stateViewport = {
    scale: numberFromRecord(stateRecord, "scale"),
    x: numberFromRecord(stateRecord, "x"),
    y: numberFromRecord(stateRecord, "y"),
  };
  return stateViewport.scale !== null &&
    stateViewport.x !== null &&
    stateViewport.y !== null
    ? (stateViewport as MindMapViewport)
    : null;
}

function summarizeMindMapRaw(raw: unknown) {
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
    dataKind: data?.kind ?? null,
    hasRoot: !!(record.root ?? data?.root),
    rootChildren:
      record.root &&
      typeof record.root === "object" &&
      Array.isArray((record.root as { children?: unknown[] }).children)
        ? (record.root as { children: unknown[] }).children.length
        : data?.root &&
          typeof data.root === "object" &&
          Array.isArray((data.root as { children?: unknown[] }).children)
        ? (data.root as { children: unknown[] }).children.length
        : null,
  };
}

export default function MindMapEmbedViewer({
  data,
  editUrl,
}: {
  data: unknown;
  editUrl: string;
}) {
  embedDebug("mindmap viewer render start", {
    data: summarizeMindMapRaw(data),
    editUrl,
  });
  const embedBootstrap = getEmbedBootstrap();
  const mindMapIframeSrc = (() => {
    const params = new URLSearchParams();
    if (embedBootstrap.token) {
      params.set("_t", embedBootstrap.token);
    }
    if (embedBootstrap.fileId) {
      params.set("fileId", embedBootstrap.fileId);
    }
    const qs = params.toString();
    return qs
      ? `/embed/mind-map/index.html?${qs}`
      : "/embed/mind-map/index.html";
  })();
  const mindMapData = getMindMapEmbedData(data);
  embedDebug("mindmap viewer data ready", {
    rootText: mindMapData.root?.data?.text ?? null,
    rootChildren: mindMapData.root?.children?.length ?? 0,
    layout: mindMapData.layout ?? null,
    hasView: !!mindMapData.view,
  });
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const pendingInitRef = useRef<ReturnType<
    typeof buildMindMapEmbedBridgePayload
  > | null>(null);
  const [isReady, setIsReady] = useState(false);
  const isAppInitedRef = useRef(false);
  const pendingRestoreRef = useRef(false);
  const [isAtDefaultView, setIsAtDefaultView] = useState(true);
  const isAtDefaultViewRef = useRef(true);
  const defaultViewport = useRef<MindMapViewport | null>(null);
  const suppressViewTracking = useRef(false);
  const awaitingPreviewViewportRef = useRef(true);

  useEffect(() => {
    isAtDefaultViewRef.current = isAtDefaultView;
  }, [isAtDefaultView]);

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
    const payload =
      pendingInitRef.current ?? buildMindMapEmbedBridgePayload(mindMapData);
    pendingInitRef.current = payload;
    embedDebug("mindmap post init", {
      ...getFrameDebugInfo(),
      rootChildren: mindMapData.root?.children?.length ?? 0,
      hasView: !!mindMapData.view,
    });
    iframeRef.current?.contentWindow?.postMessage(
      {
        source: "excalidraw-web",
        type: "initMindMap",
        payload,
      },
      window.location.origin,
    );
  }, [mindMapData, getFrameDebugInfo]);

  const applyMindMapPreviewRange = useCallback(() => {
    if (!isAppInitedRef.current) {
      pendingRestoreRef.current = true;
      embedDebug("mindmap preview range deferred: app not inited");
      return;
    }
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    embedDebug("mindmap preview range apply", {
      requestId,
      ...getFrameDebugInfo(),
      hasInitialView: !!mindMapData.view,
    });
    suppressViewTracking.current = true;
    iframeRef.current?.contentWindow?.postMessage(
      {
        source: "excalidraw-web",
        type: "restoreMindMapView",
        payload: { requestId, reason: "embed-button" },
      },
      window.location.origin,
    );
  }, [mindMapData.view, getFrameDebugInfo]);

  const pinState = useEmbedPinState();
  const containerRef = useRef<HTMLDivElement>(null);
  useEmbedIframeAutoLock(
    pinState.isPinned,
    pinState.pin,
    containerRef,
    iframeRef,
  );

  const handleResetView = useCallback(() => {
    embedDebug("mindmap reset view clicked", {
      isAtDefaultView,
      isInteractionMasked: pinState.isPinned,
      defaultViewport: roundMmViewport(defaultViewport.current),
    });
    applyMindMapPreviewRange();
  }, [applyMindMapPreviewRange, isAtDefaultView, pinState.isPinned]);

  useEffect(() => {
    pendingInitRef.current = buildMindMapEmbedBridgePayload(mindMapData);
  }, [mindMapData]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      const message = event.data as {
        source?: unknown;
        type?: unknown;
        payload?: Record<string, unknown>;
      };
      if (message?.source !== "simple-mind-map-native") {
        return;
      }

      if (message.type === "ready") {
        embedMark("mindmap-bridge-ready");
        embedMeasure(
          "entry-to-mindmap-bridge-ready",
          "entry-start",
          "mindmap-bridge-ready",
        );
        embedDebug("mindmap iframe ready", getFrameDebugInfo());
        setIsReady(true);
        postInit();
        return;
      }

      if (message.type === "appInited") {
        embedMark("mindmap-app-inited");
        embedMeasure(
          "entry-to-mindmap-app-inited",
          "entry-start",
          "mindmap-app-inited",
        );
        embedDebug("mindmap iframe appInited", getFrameDebugInfo());
        isAppInitedRef.current = true;
        if (pendingRestoreRef.current) {
          pendingRestoreRef.current = false;
          applyMindMapPreviewRange();
        }
        return;
      }

      if (message.type === "mindMapViewRestoreDone") {
        const payload = message.payload ?? null;
        const ok = payload?.ok !== false;
        embedDebug("mindmap iframe view restore done", {
          ...getFrameDebugInfo(),
          payload,
          ok,
        });
        if (!ok) {
          suppressViewTracking.current = false;
          return;
        }
        awaitingPreviewViewportRef.current = false;
        setIsAtDefaultView(true);
        return;
      }

      if (message.type === "mindMapViewState") {
        const current = getMindMapViewportFromPayload(message.payload);
        if (!current) {
          return;
        }

        if (awaitingPreviewViewportRef.current) {
          return;
        }

        if (suppressViewTracking.current) {
          suppressViewTracking.current = false;
          defaultViewport.current = current;
          embedDebug("mindmap view state recalibrated after locate", {
            defaultViewport: roundMmViewport(current),
          });
          setIsAtDefaultView(true);
          return;
        }

        if (!defaultViewport.current) {
          defaultViewport.current = current;
          embedDebug("mindmap default viewport initialized", {
            viewport: roundMmViewport(current),
          });
          setIsAtDefaultView(true);
          return;
        }

        const dv = defaultViewport.current;
        const moved =
          Math.abs(current.x - dv.x) > 2 ||
          Math.abs(current.y - dv.y) > 2 ||
          Math.abs(current.scale - dv.scale) > 0.01;

        if (moved) {
          if (!isAtDefaultViewRef.current) {
            return;
          }
          embedDebug("mindmap view state -> free-offset", {
            current: roundMmViewport(current),
            defaultViewport: roundMmViewport(dv),
          });
          setIsAtDefaultView(false);
        } else {
          if (isAtDefaultViewRef.current) {
            return;
          }
          embedDebug("mindmap view state -> overview", {
            current: roundMmViewport(current),
          });
          setIsAtDefaultView(true);
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [applyMindMapPreviewRange, getFrameDebugInfo, postInit]);

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

  const lockInteraction = pinState.isPinned;

  return (
    <div className="mindmap-embed-viewer" ref={containerRef}>
      <iframe
        ref={iframeRef}
        title="MindMap"
        className={`mindmap-embed-viewer__frame${
          lockInteraction ? " mindmap-embed-viewer__frame--locked" : ""
        }`}
        src={mindMapIframeSrc}
        onLoad={() => embedDebug("mindmap iframe load", getFrameDebugInfo())}
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
          data-offset={isAtDefaultView ? "false" : "true"}
          onClick={handleResetView}
          title="回到初始位置"
          aria-label="回到初始位置"
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
}
