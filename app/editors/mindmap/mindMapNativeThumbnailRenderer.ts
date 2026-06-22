import { createEmptyMindMapData } from "../../data/formats/MindMapAdapter";
import { createLogger } from "../../lib/logger";
import { LocalThumbnailCache } from "../../data/localThumbnailCache";
import {
  markMindMapThumbnailSource,
  normalizeMindMapThumbnailSvg,
} from "../../data/thumbnailSvg";

import { toNativeMindMapBridgePayload } from "./mindMapBridgePayload";
import {
  isNativeMindMapMessage,
  MINDMAP_HOST_SOURCE,
  type NativeMindMapMessage,
} from "./mindMapBridgeProtocol";
import {
  getNativeMindMapTargetOrigin,
  isAllowedNativeMindMapMessageOrigin,
  NATIVE_MINDMAP_URL,
} from "./mindMapBridgeOrigins";

import type { MindMapDocumentData } from "../../data/formats/MindMapAdapter";

const logThumb = createLogger({ module: "thumbnail" });

/** First iframe boot (Vue + simple-mind-map chunks) can exceed 20s on cold load. */
const NATIVE_THUMBNAIL_WARM_TIMEOUT_MS = 60_000;
/** Warm iframe: swap data + export SVG. */
const NATIVE_THUMBNAIL_RENDER_TIMEOUT_MS = 35_000;
/** Delay between init repeat and export so setFullData can start layout. */
const EXPORT_AFTER_DATA_MS = 200;

type ThumbnailStage =
  | "idle"
  | "iframe_append"
  | "bridge_ready"
  | "warm_init_sent"
  | "warm_app_inited"
  | "render_init_sent"
  | "export_requested"
  | "thumbnail_received"
  | "timeout"
  | "iframe_error"
  | "pool_reset";

type StageLog = {
  stage: ThumbnailStage;
  elapsedMs: number;
  fileId8?: string;
  extra?: Record<string, unknown>;
};

let renderQueue: Promise<void> = Promise.resolve();
let editorHostActiveCount = 0;
let deferredWarmHandle: number | ReturnType<typeof requestIdleCallback> | null =
  null;

function isEditorHostActive(): boolean {
  return editorHostActiveCount > 0;
}

function cancelDeferredThumbnailWarm(): void {
  if (deferredWarmHandle == null) {
    return;
  }
  if (typeof window.requestIdleCallback === "function") {
    window.cancelIdleCallback(deferredWarmHandle as number);
  } else {
    window.clearTimeout(deferredWarmHandle as number);
  }
  deferredWarmHandle = null;
}

function scheduleDeferredThumbnailWarm(): void {
  if (typeof window === "undefined" || isEditorHostActive()) {
    return;
  }
  cancelDeferredThumbnailWarm();
  const run = () => {
    deferredWarmHandle = null;
    if (!isEditorHostActive()) {
      void thumbnailPool.ensureWarm();
    }
  };
  if (typeof window.requestIdleCallback === "function") {
    deferredWarmHandle = window.requestIdleCallback(run, { timeout: 8000 });
  } else {
    deferredWarmHandle = window.setTimeout(run, 4000);
  }
}

function logStage(entry: StageLog): void {
  logThumb.debug("mindmap-thumb-pool stage", entry);
}

function logFailed(
  reason: string,
  entry: Omit<StageLog, "stage"> & { stage?: ThumbnailStage },
): void {
  logThumb.event("warn", "mindmap-thumb-pool.failed", reason, {
    fields: entry,
  });
}

export function decodeNativeMindMapThumbnail(payload: unknown): string | null {
  if (typeof payload !== "string" || !payload) {
    return null;
  }
  if (!payload.startsWith("data:image/svg+xml")) {
    return markMindMapThumbnailSource(
      normalizeMindMapThumbnailSvg(payload),
      "native",
    );
  }
  const commaIndex = payload.indexOf(",");
  if (commaIndex === -1) {
    return null;
  }
  const meta = payload.slice(0, commaIndex);
  const body = payload.slice(commaIndex + 1);
  try {
    const decoded = meta.includes(";base64")
      ? new TextDecoder().decode(
          Uint8Array.from(atob(body), (c) => c.charCodeAt(0)),
        )
      : decodeURIComponent(body);
    return markMindMapThumbnailSource(
      normalizeMindMapThumbnailSvg(decoded),
      "native",
    );
  } catch {
    return null;
  }
}

function enqueueNativeThumbnailRender(
  task: () => Promise<string | null>,
): Promise<string | null> {
  const result = renderQueue.then(task, task);
  renderQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function postToNative(
  iframe: HTMLIFrameElement,
  type: string,
  payload?: unknown,
): boolean {
  if (!iframe.contentWindow) {
    return false;
  }
  iframe.contentWindow.postMessage(
    { source: MINDMAP_HOST_SOURCE, type, payload },
    getNativeMindMapTargetOrigin(),
  );
  return true;
}

function createHiddenNativeIframe(): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.tabIndex = -1;
  iframe.src = NATIVE_MINDMAP_URL;
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = "1280px";
  iframe.style.height = "768px";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.style.border = "0";
  return iframe;
}

type PendingSession = {
  startedAt: number;
  fileId8: string | null;
  stage: ThumbnailStage;
  resolve: (thumbnail: string | null) => void;
  timeoutId: number;
  expect: "warm" | "thumbnail";
};

class MindMapThumbnailIframePool {
  private iframe: HTMLIFrameElement | null = null;
  private isReady = false;
  private warmPromise: Promise<boolean> | null = null;
  private pending: PendingSession | null = null;
  private onMessageBound = (event: MessageEvent<unknown>) => {
    this.onMessage(event);
  };

  suspend(reason: string): void {
    this.reset(reason);
  }

  reset(reason: string): void {
    if (this.pending) {
      window.clearTimeout(this.pending.timeoutId);
      this.pending.resolve(null);
      this.pending = null;
    }
    if (this.iframe) {
      this.iframe.removeEventListener("error", this.onIframeErrorBound);
      this.iframe.remove();
      this.iframe = null;
    }
    window.removeEventListener("message", this.onMessageBound);
    this.isReady = false;
    this.warmPromise = null;
    logStage({ stage: "pool_reset", elapsedMs: 0, extra: { reason } });
  }

  private onIframeErrorBound = () => {
    logFailed("iframe error event", {
      stage: "iframe_error",
      elapsedMs: this.pendingElapsed(),
      fileId8: this.pending?.fileId8 ?? undefined,
    });
    this.reset("iframe-error");
    this.pending?.resolve(null);
    this.pending = null;
  };

  private pendingElapsed(): number {
    return this.pending
      ? Math.round(performance.now() - this.pending.startedAt)
      : 0;
  }

  private setStage(stage: ThumbnailStage): void {
    if (this.pending) {
      this.pending.stage = stage;
    }
    logStage({
      stage,
      elapsedMs: this.pendingElapsed(),
      fileId8: this.pending?.fileId8 ?? undefined,
    });
  }

  private ensureIframe(): HTMLIFrameElement {
    if (this.iframe) {
      return this.iframe;
    }
    const iframe = createHiddenNativeIframe();
    iframe.addEventListener("error", this.onIframeErrorBound);
    window.addEventListener("message", this.onMessageBound);
    document.body.appendChild(iframe);
    this.iframe = iframe;
    this.setStage("iframe_append");
    return iframe;
  }

  private onMessage(event: MessageEvent<unknown>): void {
    const iframe = this.iframe;
    if (
      !iframe ||
      event.source !== iframe.contentWindow ||
      !isAllowedNativeMindMapMessageOrigin(event.origin, {
        iframeSrc: iframe.src,
      }) ||
      !isNativeMindMapMessage(event.data)
    ) {
      return;
    }
    const message = event.data as NativeMindMapMessage;

    if (message.type === "mindMapIframeError") {
      logFailed("mindMapIframeError from bridge", {
        stage: "iframe_error",
        elapsedMs: this.pendingElapsed(),
        fileId8: this.pending?.fileId8 ?? undefined,
        extra: {
          payload:
            message.payload && typeof message.payload === "object"
              ? message.payload
              : null,
        },
      });
      this.reset("bridge-error");
      this.pending?.resolve(null);
      this.pending = null;
      return;
    }

    if (message.type === "ready") {
      this.setStage("bridge_ready");
      if (this.pending?.expect === "warm") {
        const warmPayload = toNativeMindMapBridgePayload(
          createEmptyMindMapData(" "),
          null,
          { applyBrowserView: false },
        );
        postToNative(iframe, "initMindMap", warmPayload);
        this.setStage("warm_init_sent");
      }
      return;
    }

    if (message.type === "appInited") {
      if (this.pending?.expect === "warm") {
        this.isReady = true;
        this.setStage("warm_app_inited");
        window.clearTimeout(this.pending.timeoutId);
        this.pending.resolve(null);
        this.pending = null;
      }
      return;
    }

    if (message.type === "saveMindMapThumbnail") {
      if (this.pending?.expect !== "thumbnail") {
        return;
      }
      const messagePayload = message.payload;
      const thumbnail = decodeNativeMindMapThumbnail(
        messagePayload && typeof messagePayload === "object"
          ? (messagePayload as { thumbnail?: unknown }).thumbnail
          : null,
      );
      this.setStage("thumbnail_received");
      window.clearTimeout(this.pending.timeoutId);
      const resolve = this.pending.resolve;
      this.pending = null;
      resolve(thumbnail);
    }
  }

  private beginSession(
    expect: PendingSession["expect"],
    timeoutMs: number,
    fileId8: string | null,
    onTimeout: () => void,
  ): void {
    if (this.pending) {
      window.clearTimeout(this.pending.timeoutId);
      this.pending.resolve(null);
    }
    const startedAt = performance.now();
    const timeoutId = window.setTimeout(() => {
      const stage = this.pending?.stage ?? "timeout";
      logFailed(`timeout during ${expect}`, {
        stage: "timeout",
        elapsedMs: Math.round(performance.now() - startedAt),
        fileId8: fileId8 ?? undefined,
        extra: { lastStage: stage, timeoutMs, expect },
      });
      onTimeout();
    }, timeoutMs);
    this.pending = {
      startedAt,
      fileId8,
      stage: "idle",
      expect,
      timeoutId,
      resolve: () => {},
    };
  }

  async ensureWarm(): Promise<boolean> {
    if (this.isReady) {
      return true;
    }
    if (isEditorHostActive()) {
      logThumb.debug("mindmap-thumb-pool warm skipped", {
        reason: "editor-host-active",
      });
      return false;
    }
    if (typeof window === "undefined" || typeof document === "undefined") {
      return false;
    }
    if (!this.warmPromise) {
      this.warmPromise = this.runWarm().finally(() => {
        this.warmPromise = null;
      });
    }
    return this.warmPromise;
  }

  private async runWarm(): Promise<boolean> {
    if (this.isReady) {
      return true;
    }
    logStage({ stage: "idle", elapsedMs: 0, extra: { action: "warm-start" } });

    const warmed = await new Promise<boolean>((resolve) => {
      this.beginSession(
        "warm",
        NATIVE_THUMBNAIL_WARM_TIMEOUT_MS,
        null,
        () => {
          this.reset("timeout-warm");
          resolve(false);
        },
      );
      this.pending!.resolve = () => resolve(this.isReady);
      this.ensureIframe();
    });

    if (!warmed) {
      logFailed("warm session ended without appInited", {
        elapsedMs: 0,
        extra: { timeoutMs: NATIVE_THUMBNAIL_WARM_TIMEOUT_MS },
      });
      return false;
    }
    logThumb.debug("mindmap-thumb-pool warm OK", {
      timeoutMs: NATIVE_THUMBNAIL_WARM_TIMEOUT_MS,
    });
    return true;
  }

  private async renderOnce(
    data: MindMapDocumentData,
    opts: { fileId?: string | null; timeoutMs?: number },
  ): Promise<string | null> {
    const fileId8 = opts.fileId?.slice(0, 8) ?? null;
    const timeoutMs = opts.timeoutMs ?? NATIVE_THUMBNAIL_RENDER_TIMEOUT_MS;
    const warmed = await this.ensureWarm();
    if (!warmed || !this.iframe) {
      return null;
    }

    const payload = toNativeMindMapBridgePayload(data, opts.fileId ?? null, {
      applyBrowserView: false,
    });
    const iframe = this.iframe;
    const startedAt = performance.now();

    return new Promise<string | null>((resolve) => {
      this.beginSession("thumbnail", timeoutMs, fileId8, () => {
        this.reset("render-timeout");
        resolve(null);
      });
      this.pending!.resolve = (thumbnail) => resolve(thumbnail);

      postToNative(iframe, "initMindMap", payload);
      this.setStage("render_init_sent");

      window.setTimeout(() => {
        if (!this.pending || this.pending.expect !== "thumbnail") {
          return;
        }
        postToNative(iframe, "hostExportDraftThumbnail", {});
        this.setStage("export_requested");
      }, EXPORT_AFTER_DATA_MS);
    }).then((thumbnail) => {
      if (!thumbnail) {
        logFailed("generateMindMapThumb FAILED: empty thumbnail", {
          elapsedMs: Math.round(performance.now() - startedAt),
          fileId8: fileId8 ?? undefined,
          extra: { poolReady: this.isReady },
        });
      } else {
        logThumb.debug("generateMindMapThumb OK", {
          fileId8,
          svgLen: thumbnail.length,
          elapsedMs: Math.round(performance.now() - startedAt),
        });
      }
      return thumbnail;
    });
  }

  async render(
    data: MindMapDocumentData,
    opts: { fileId?: string | null; timeoutMs?: number } = {},
  ): Promise<string | null> {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return null;
    }
    if (isEditorHostActive()) {
      logThumb.event("warn", "mindmap-thumb-pool.render-skipped", "editor active", {
        fields: {
          fileId8: opts.fileId?.slice(0, 8) ?? null,
          reason: "editor-host-active",
        },
      });
      return null;
    }
    const fileId8 = opts.fileId?.slice(0, 8) ?? null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (attempt > 0) {
        logThumb.debug("mindmap-thumb-pool render retry", {
          fileId8,
          attempt: attempt + 1,
        });
        this.reset("render-retry");
      }
      const thumbnail = await this.renderOnce(data, opts);
      if (thumbnail) {
        return thumbnail;
      }
    }

    logFailed("generateMindMapThumb FAILED: render exhausted retries", {
      elapsedMs: 0,
      fileId8: fileId8 ?? undefined,
    });
    return null;
  }
}

const thumbnailPool = new MindMapThumbnailIframePool();

/**
 * Editor iframe and hidden thumbnail pool must not run together — two full
 * simple-mind-map runtimes freeze open/save on mid-range hardware.
 */
export function setMindMapEditorHostActive(active: boolean): void {
  if (active) {
    editorHostActiveCount += 1;
    cancelDeferredThumbnailWarm();
    thumbnailPool.suspend("editor-host-active");
    logThumb.debug("mindmap-thumb-pool suspended", {
      editorHostActiveCount,
    });
    return;
  }
  editorHostActiveCount = Math.max(0, editorHostActiveCount - 1);
  logThumb.debug("mindmap-thumb-pool editor inactive", {
    editorHostActiveCount,
  });
  if (editorHostActiveCount === 0) {
    scheduleDeferredThumbnailWarm();
  }
}

/** Idle warm after file list load — skipped while editor is open. */
export function scheduleMindMapThumbnailIframeWarm(): void {
  scheduleDeferredThumbnailWarm();
}

/** Preload hidden MindMap iframe so import thumbnails skip cold-start. */
export function warmMindMapThumbnailIframe(): Promise<boolean> {
  if (isEditorHostActive()) {
    return Promise.resolve(false);
  }
  return thumbnailPool.ensureWarm();
}

export function buildNativeMindMapThumbnailSvg(
  data: MindMapDocumentData,
  opts: { fileId?: string | null; timeoutMs?: number } = {},
): Promise<string | null> {
  return enqueueNativeThumbnailRender(() => thumbnailPool.render(data, opts));
}

export async function generateMindMapThumbnailAndCache(
  fileId: string,
  data: MindMapDocumentData,
): Promise<string | undefined> {
  const thumbnail = await buildNativeMindMapThumbnailSvg(data, { fileId });
  if (!thumbnail) {
    return undefined;
  }
  LocalThumbnailCache.set(fileId, thumbnail);
  return thumbnail;
}

/** @internal Test-only reset. */
export function resetMindMapThumbnailIframePoolForTests(): void {
  editorHostActiveCount = 0;
  cancelDeferredThumbnailWarm();
  thumbnailPool.reset("test");
}
