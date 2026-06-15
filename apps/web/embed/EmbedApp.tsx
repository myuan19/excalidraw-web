import { Suspense, useEffect, useMemo } from "react";

import { buildEmbedEditUrl } from "../data/embedDocument";
import { editorRegistry } from "../editors";
import { getLazyEmbedViewer } from "../editors/lazyViews";
import { logEditorOpenPhase } from "../lib/editorOpenPhases";
import { embedDebug, embedMark } from "./embedDebug";
import { getEmbedBootstrap } from "./embedMode";
import { useEmbedDocument } from "./useEmbedDocument";

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
  const { data, error } = useEmbedDocument(bootstrap);
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

  // 稳定引用：仅 data 变化时才换新对象，viewer 以 prop 引用变化感知内容更新。
  // data 未加载时跳过（prepareEmbedData 对 null 会抛错）
  const preparedData = useMemo(
    () =>
      data == null || !plugin?.prepareEmbedData
        ? data
        : plugin.prepareEmbedData(data),
    [plugin, data],
  );

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
