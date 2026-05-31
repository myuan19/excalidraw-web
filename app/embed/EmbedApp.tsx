import { Suspense, useEffect, useMemo, useState } from "react";

import { buildEmbedEditUrl } from "../data/embedDocument";
import { editorRegistry } from "../editors";
import { getLazyEmbedViewer } from "../editors/lazyViews";
import {
  formatIfNoneMatchHeader,
  getEmbedDocumentCache,
  setEmbedDocumentCache,
} from "./embedDocumentCache";
import { logEditorOpenPhase } from "../lib/editorOpenPhases";
import { embedDebug, embedMark, embedMeasure } from "./embedDebug";
import { getEmbedBootstrap } from "./embedMode";

function EmbedChunkFallback() {
  useEffect(() => {
    logEditorOpenPhase("shell_chunk", { stage: "embed_viewer" });
  }, []);
  return null;
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
  const kind = editorRegistry.resolveKind(bootstrap.kind);
  const plugin = editorRegistry.getByKind(kind);
  const LazyViewer = useMemo(() => getLazyEmbedViewer(plugin), [plugin]);
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
        const fileId = bootstrap.fileId ?? "";
        const cached = fileId ? getEmbedDocumentCache(fileId) : null;
        const headers: Record<string, string> = { Accept: "application/json" };
        if (cached?.etag) {
          headers["If-None-Match"] = formatIfNoneMatchHeader(cached.etag);
        }
        const response = await fetch(bootstrap.dataUrl!, {
          headers,
          cache: "no-store",
        });
        embedDebug("payload fetch response", {
          kind,
          dataUrl: bootstrap.dataUrl,
          ok: response.ok,
          status: response.status,
          contentType: response.headers.get("content-type"),
        });
        if (response.status === 304) {
          if (!cached?.payload) {
            throw new Error("Embed data unchanged but no session cache");
          }
          if (disposed) {
            return;
          }
          embedMark("payload-fetched");
          embedMeasure("payload-fetch", "payload-fetch-start", "payload-fetched");
          embedDebug("payload 304 reused cache", { kind, fileId: fileId.slice(0, 8) });
          setData(cached.payload.data ?? null);
          return;
        }
        if (!response.ok) {
          throw new Error(`Embed data request failed: ${response.status}`);
        }
        const payload = await response.json();
        if (disposed) {
          return;
        }
        const etag =
          response.headers.get("etag")?.replace(/^"|"$/g, "") ?? null;
        if (fileId && etag) {
          setEmbedDocumentCache(fileId, etag, {
            data: payload?.data ?? null,
          });
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
    embedDebug("render waiting for embed data (no UI)");
    return null;
  }

  if (!LazyViewer) {
    return <EmbedError message={`暂不支持嵌入预览：${kind}`} />;
  }

  const preparedData = plugin?.prepareEmbedData
    ? plugin.prepareEmbedData(data)
    : data;

  embedDebug("render viewer", {
    kind,
    dataSummary: summarizePayload(data),
  });
  return (
    <Suspense fallback={<EmbedChunkFallback />}>
      <LazyViewer data={preparedData} editUrl={editUrl} />
    </Suspense>
  );
}
