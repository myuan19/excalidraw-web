import { Suspense, lazy, useEffect, useMemo, useState } from "react";

import { buildEmbedEditUrl } from "../data/embedDocument";
import { embedDebug, embedMark, embedMeasure } from "./embedDebug";
import { getEmbedBootstrap } from "./embedMode";

import type { EmbedDocumentKind } from "./embedMode";

const LazyExcalidrawEmbedViewer = lazy(async () => {
  embedMark("excalidraw-viewer-import-start");
  const mod = await import("./ExcalidrawEmbedViewer");
  embedMark("excalidraw-viewer-imported");
  embedMeasure(
    "excalidraw-viewer-import",
    "excalidraw-viewer-import-start",
    "excalidraw-viewer-imported",
  );
  return mod;
});

const LazyMindMapEmbedViewer = lazy(async () => {
  embedMark("mindmap-viewer-import-start");
  const mod = await import("./MindMapEmbedViewer");
  embedMark("mindmap-viewer-imported");
  embedMeasure(
    "mindmap-viewer-import",
    "mindmap-viewer-import-start",
    "mindmap-viewer-imported",
  );
  return mod;
});

function normalizeKind(kind: unknown): EmbedDocumentKind {
  return kind === "mindmap" ? "mindmap" : "excalidraw";
}

function EmbedFallback() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        fontFamily: "system-ui, sans-serif",
        color: "#868e96",
      }}
    >
      加载嵌入画布…
    </div>
  );
}

function EmbedError({ message }: { message: string }) {
  return (
    <div className="excalidraw-embed-viewer excalidraw-embed-viewer--error">
      {message}
    </div>
  );
}

function summarizePayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return {
      type: payload === null ? "null" : typeof payload,
    };
  }
  const record = payload as Record<string, unknown>;
  const data =
    record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : null;
  return {
    keys: Object.keys(record).slice(0, 12),
    kind: record.kind ?? null,
    hasData: data != null,
    dataKind: data?.kind ?? null,
    dataKeys: data ? Object.keys(data).slice(0, 12) : null,
    dataElements: data && Array.isArray(data.elements) ? data.elements.length : null,
    wrappedElements:
      data?.data &&
      typeof data.data === "object" &&
      Array.isArray((data.data as Record<string, unknown>).elements)
        ? ((data.data as Record<string, unknown>).elements as unknown[]).length
        : null,
  };
}

export default function EmbedApp() {
  const bootstrap = useMemo(() => getEmbedBootstrap(), []);
  const kind = normalizeKind(bootstrap.kind);
  const [data, setData] = useState<unknown>(() =>
    bootstrap.dataUrl ? null : window.__EXCALIDRAW_EMBED_DATA__ ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const editUrl = buildEmbedEditUrl(bootstrap.fileId, kind);

  useEffect(() => {
    embedMark("entry-start");
    embedDebug("entry start", {
      fileId: bootstrap.fileId ?? null,
      fileName: bootstrap.fileName ?? null,
      kind,
      hasDataUrl: !!bootstrap.dataUrl,
      hasLegacyData: !!window.__EXCALIDRAW_EMBED_DATA__,
      dataUrl: bootstrap.dataUrl ?? null,
      tokenLength: bootstrap.token?.length ?? 0,
      bootstrapKeys: Object.keys(bootstrap),
      initialDataSummary: summarizePayload(window.__EXCALIDRAW_EMBED_DATA__),
    });
  }, [bootstrap, kind]);

  embedDebug("render state", {
    kind,
    hasData: !!data,
    hasError: !!error,
    dataSummary: summarizePayload(data),
  });

  useEffect(() => {
    if (!bootstrap.dataUrl) {
      return;
    }
    let disposed = false;
    async function loadData() {
      try {
        embedMark("payload-fetch-start");
        embedDebug("payload fetch start", {
          kind,
          dataUrl: bootstrap.dataUrl,
        });
        const response = await fetch(bootstrap.dataUrl!, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        embedDebug("payload fetch response", {
          kind,
          dataUrl: bootstrap.dataUrl,
          ok: response.ok,
          status: response.status,
          contentType: response.headers.get("content-type"),
        });
        if (!response.ok) {
          throw new Error(`Embed data request failed: ${response.status}`);
        }
        const payload = await response.json();
        if (disposed) {
          return;
        }
        embedMark("payload-fetched");
        embedMeasure("payload-fetch", "payload-fetch-start", "payload-fetched");
        embedDebug("payload fetched", {
          kind,
          hasData: payload?.data != null,
          payloadSummary: summarizePayload(payload),
        });
        setData(payload?.data ?? null);
      } catch (err) {
        if (disposed) {
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        embedDebug("payload fetch failed", {
          message,
          stack: err instanceof Error ? err.stack : null,
        });
        setError(message);
      }
    }
    void loadData();
    return () => {
      disposed = true;
    };
  }, [bootstrap.dataUrl, kind]);

  if (error) {
    embedDebug("render error", { message: error });
    return <EmbedError message={error} />;
  }

  if (!data) {
    embedDebug("render fallback no data", {
      kind,
      dataUrl: bootstrap.dataUrl ?? null,
    });
    return <EmbedFallback />;
  }

  embedDebug("render viewer", {
    kind,
    dataSummary: summarizePayload(data),
  });
  return (
    <Suspense fallback={<EmbedFallback />}>
      {kind === "mindmap" ? (
        <LazyMindMapEmbedViewer data={data} editUrl={editUrl} />
      ) : (
        <LazyExcalidrawEmbedViewer data={data} editUrl={editUrl} />
      )}
    </Suspense>
  );
}
