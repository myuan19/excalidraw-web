import { MindMapAdapter } from "../../data/formats/MindMapAdapter";
import { hashDocumentSnapshot } from "../../data/sceneHash";
import { cacheDraftThumbnailIfVisible } from "../../data/thumbnailLifecycle";
import { normalizeMindMapThumbnailSvg } from "../../data/thumbnailSvg";

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

const NATIVE_THUMBNAIL_TIMEOUT_MS = 20_000;
let renderQueue: Promise<void> = Promise.resolve();

export function decodeNativeMindMapThumbnail(payload: unknown): string | null {
  if (typeof payload !== "string" || !payload) {
    return null;
  }
  if (!payload.startsWith("data:image/svg+xml")) {
    return normalizeMindMapThumbnailSvg(payload, { source: "native" });
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
    return normalizeMindMapThumbnailSvg(decoded, { source: "native" });
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

async function renderNativeMindMapThumbnail(
  data: MindMapDocumentData,
  opts: { fileId?: string | null; timeoutMs?: number } = {},
): Promise<string | null> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }

  return new Promise((resolve) => {
    const iframe = createHiddenNativeIframe();
    const payload = toNativeMindMapBridgePayload(data, opts.fileId ?? null);
    const timeoutMs = opts.timeoutMs ?? NATIVE_THUMBNAIL_TIMEOUT_MS;
    let finished = false;
    let timeoutId: number | null = null;

    const finish = (thumbnail: string | null) => {
      if (finished) {
        return;
      }
      finished = true;
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
      window.removeEventListener("message", onMessage);
      iframe.removeEventListener("error", onIframeError);
      iframe.remove();
      resolve(thumbnail);
    };

    const onIframeError = () => finish(null);

    const onMessage = (event: MessageEvent<unknown>) => {
      if (
        !isAllowedNativeMindMapMessageOrigin(event.origin, {
          iframeSrc: iframe.src,
        }) ||
        !isNativeMindMapMessage(event.data)
      ) {
        return;
      }
      const message = event.data as NativeMindMapMessage;
      if (message.type === "mindMapIframeError") {
        finish(null);
        return;
      }
      if (message.type === "ready") {
        postToNative(iframe, "initMindMap", payload);
        return;
      }
      if (message.type === "appInited") {
        postToNative(iframe, "hostExportDraftThumbnail", {});
        return;
      }
      if (message.type === "saveMindMapThumbnail") {
        const messagePayload = message.payload;
        const thumbnail = decodeNativeMindMapThumbnail(
          messagePayload && typeof messagePayload === "object"
            ? (messagePayload as { thumbnail?: unknown }).thumbnail
            : null,
        );
        finish(thumbnail);
      }
    };

    timeoutId = window.setTimeout(() => finish(null), timeoutMs);
    window.addEventListener("message", onMessage);
    iframe.addEventListener("error", onIframeError);
    document.body.appendChild(iframe);
  });
}

export function buildNativeMindMapThumbnailSvg(
  data: MindMapDocumentData,
  opts: { fileId?: string | null; timeoutMs?: number } = {},
): Promise<string | null> {
  return enqueueNativeThumbnailRender(() =>
    renderNativeMindMapThumbnail(data, opts),
  );
}

export async function generateMindMapThumbnailAndCache(
  fileId: string,
  data: MindMapDocumentData,
): Promise<string | undefined> {
  const thumbnail = await buildNativeMindMapThumbnailSvg(data, { fileId });
  if (!thumbnail) {
    return undefined;
  }
  cacheDraftThumbnailIfVisible(
    fileId,
    "mindmap",
    thumbnail,
    hashDocumentSnapshot(MindMapAdapter.toDocument(data)),
  );
  return thumbnail;
}
