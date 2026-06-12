import { useEffect, useRef, useState } from "react";

import {
  formatIfNoneMatchHeader,
  getEmbedDocumentCache,
  setEmbedDocumentCache,
} from "./embedDocumentCache";
import { embedDebug, embedMark, embedMeasure } from "./embedDebug";

import type { EmbedBootstrap } from "./embedMode";

/**
 * Embed 文档加载 + 版本跟随。
 *
 * 服务端无推送通道（embed 通常跨浏览上下文，BroadcastChannel 不可达），
 * 用 ETag 条件轮询跟随版本：304 零开销跳过，仅内容变化时更新 data。
 * 页面不可见时暂停轮询，重新可见时立即检查一次。
 */
const POLL_INTERVAL_MS = 15_000;

export function useEmbedDocument(bootstrap: EmbedBootstrap): {
  data: unknown;
  error: string | null;
} {
  const [data, setData] = useState<unknown>(() =>
    bootstrap.dataUrl ? null : window.__EXCALIDRAW_EMBED_DATA__ ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  // 已应用到 data 的 ETag；轮询拿到相同 ETag（200 但内容未变）时跳过 setData
  const appliedEtagRef = useRef<string | null>(null);

  useEffect(() => {
    const { dataUrl, fileId: rawFileId } = bootstrap;
    if (!dataUrl) {
      return;
    }
    const fileId = rawFileId ?? "";
    let disposed = false;
    let fetchInFlight = false;

    async function fetchDocument(isInitial: boolean) {
      if (fetchInFlight) {
        return;
      }
      fetchInFlight = true;
      try {
        if (isInitial) {
          embedMark("payload-fetch-start");
          embedDebug("payload fetch start", { dataUrl });
        }
        const cached = fileId ? getEmbedDocumentCache(fileId) : null;
        const headers: Record<string, string> = { Accept: "application/json" };
        if (cached?.etag) {
          headers["If-None-Match"] = formatIfNoneMatchHeader(cached.etag);
        }
        const response = await fetch(dataUrl!, { headers, cache: "no-store" });
        if (disposed) {
          return;
        }
        if (response.status === 304) {
          if (!isInitial) {
            // 轮询：内容未变，什么都不做
            return;
          }
          if (!cached?.payload) {
            throw new Error("Embed data unchanged but no session cache");
          }
          embedMark("payload-fetched");
          embedMeasure("payload-fetch", "payload-fetch-start", "payload-fetched");
          embedDebug("payload 304 reused cache", { fileId8: fileId.slice(0, 8) });
          appliedEtagRef.current = cached.etag;
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
          setEmbedDocumentCache(fileId, etag, { data: payload?.data ?? null });
        }
        if (!isInitial && etag && etag === appliedEtagRef.current) {
          return;
        }
        if (isInitial) {
          embedMark("payload-fetched");
          embedMeasure("payload-fetch", "payload-fetch-start", "payload-fetched");
          embedDebug("payload fetched", { hasData: payload?.data != null });
        } else {
          embedDebug("payload refreshed by polling", {
            fileId8: fileId.slice(0, 8),
            etag8: etag?.slice(0, 8) ?? null,
          });
        }
        appliedEtagRef.current = etag;
        setData(payload?.data ?? null);
      } catch (err) {
        if (disposed) {
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        embedDebug("payload fetch failed", { message, isInitial });
        if (isInitial) {
          setError(message);
        }
        // 轮询失败静默：保留当前内容，下个周期重试
      } finally {
        fetchInFlight = false;
      }
    }

    let pollTimer: number | null = null;
    const startPolling = () => {
      if (pollTimer !== null) {
        return;
      }
      pollTimer = window.setInterval(() => {
        void fetchDocument(false);
      }, POLL_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        void fetchDocument(false);
        startPolling();
      }
    };

    void fetchDocument(true);
    if (!document.hidden) {
      startPolling();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [bootstrap]);

  return { data, error };
}
