import { useCallback, useEffect, useRef } from "react";
import {
  HOST_SOURCE,
  isNativeMindMapMessage,
  NATIVE_MINDMAP_URL,
  parseMindMapSavePayload,
  toBridgePayload,
  type MindMapDocumentData,
  type MindMapSaveResult,
} from "./bridge";
import { useSettingsStore } from "@/stores/settingsStore";
import { toMindMapAIConfigPayload } from "@/features/ai";
import { applyMindMapBrowserView, saveMindMapBrowserView } from "./mindMapBrowserViewStorage";
import {
  MINDMAP_HOST_SAVE_STATUS_EVENT,
  requestMindMapHostSave,
  type MindMapHostSaveStatusPayload,
} from "./hostEvents";
import {
  parseMindMapSaveMeta,
  shouldIgnoreMindMapSavePayload,
} from "./mindMapSaveGuards";
import { editorDebugLog } from "@/features/logging/editorDebugLog";
import { describeMindMapView, mindMapDebugLog } from "./mindMapDebugLog";
import { mergeMindMapViewScale, sanitizeMindMapView } from "./mindMapView";
import { blobFromDataUrl } from "./mindMapClipboard";

export interface MindMapHostHandle {
  setData(data: MindMapDocumentData): void;
  requestSave(): Promise<MindMapSaveResult>;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read clipboard blob failed"));
    reader.readAsDataURL(blob);
  });
}

async function serializeClipboardItems(items: ClipboardItem[]) {
  return Promise.all(items.map(async (item) => {
    const entries = await Promise.all(item.types.map(async (type) => {
      const blob = await item.getType(type);
      return type.startsWith("text/")
        ? { type, text: await blob.text() }
        : { type, dataUrl: await blobToDataUrl(blob) };
    }));
    return { types: item.types, entries };
  }));
}

export function MindMapEditorHost({
  initialData,
  fileId,
  onReady,
  onChange,
}: {
  initialData: MindMapDocumentData;
  fileId?: string | null;
  onReady(handle: MindMapHostHandle): void;
  onChange(result: MindMapSaveResult): void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const latestDataRef = useRef(initialData);
  const fullAIConfig = useSettingsStore((state) => state.aiConfig);
  const language = useSettingsStore((state) => state.language);
  const requestRef = useRef<{
    id: string;
    resolve: (result: MindMapSaveResult) => void;
    reject: (error: Error) => void;
    timeout: number;
  } | null>(null);
  const latestNativeRevisionRef = useRef(0);

  const postToNative = useCallback((type: string, payload?: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(
      { source: HOST_SOURCE, type, payload },
      window.location.origin,
    );
  }, []);

  const postClipboardResult = useCallback((
    type: string,
    requestId: string | undefined,
    payload: Record<string, unknown>,
  ) => {
    if (!requestId) return;
    postToNative(type, { requestId, ...payload });
  }, [postToNative]);

  const setData = useCallback((data: MindMapDocumentData) => {
    const nextData = applyMindMapBrowserView(fileId ?? null, data);
    latestDataRef.current = nextData;
    mindMapDebugLog("host.setData", {
      fileId,
      view: describeMindMapView(nextData.view),
    });
    postToNative("setMindMapData", toBridgePayload(nextData));
    postToNative("mindMapAiConfig", toMindMapAIConfigPayload(fullAIConfig));
  }, [fileId, fullAIConfig, postToNative]);

  const requestSave = useCallback(() => {
    const id = crypto.randomUUID();
    return new Promise<MindMapSaveResult>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        requestRef.current = null;
        reject(new Error("MindMap save timeout"));
      }, 5000);
      requestRef.current = { id, resolve, reject, timeout };
      postToNative("requestMindMapSave", { requestId: id, forceThumbnail: true });
    });
  }, [postToNative]);

  useEffect(() => {
    editorDebugLog("MindMapEditorHost.reactMount", {
      fileId,
      iframeSrc: NATIVE_MINDMAP_URL,
    });
    onReady({ setData, requestSave });
    return () => editorDebugLog("MindMapEditorHost.reactUnmount", { fileId });
  }, [onReady, requestSave, setData, fileId]);

  useEffect(() => {
    postToNative("mindMapAiConfig", toMindMapAIConfigPayload(fullAIConfig));
  }, [fullAIConfig, postToNative]);

  useEffect(() => {
    const postSaveStatus = (event: Event) => {
      const payload = (event as CustomEvent<MindMapHostSaveStatusPayload>).detail;
      postToNative("mindMapHostSaveStatus", payload);
    };
    window.addEventListener(MINDMAP_HOST_SAVE_STATUS_EVENT, postSaveStatus);
    return () => window.removeEventListener(MINDMAP_HOST_SAVE_STATUS_EVENT, postSaveStatus);
  }, [postToNative]);

  useEffect(() => {
    latestDataRef.current = initialData;
  }, [initialData]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || !isNativeMindMapMessage(event.data)) {
        return;
      }
      if (event.data.type === "ready" || event.data.type === "appInited") {
        editorDebugLog(`MindMapEditorHost.${event.data.type}`, {
          fileId,
          origin: event.origin,
        });
        const data = applyMindMapBrowserView(fileId ?? null, latestDataRef.current);
        const payload = {
          ...toBridgePayload({ ...data, lang: language.startsWith("zh") ? "zh" : language }),
          mindMapAiConfig: toMindMapAIConfigPayload(fullAIConfig),
        };
        mindMapDebugLog(`host.${event.data.type}.initMindMap`, {
          fileId,
          view: describeMindMapView(payload.mindMapData?.view),
        });
        postToNative("initMindMap", payload);
        postToNative("mindMapAiConfig", toMindMapAIConfigPayload(fullAIConfig));
        return;
      }
      if (event.data.type === "saveMindMapData") {
        const meta = parseMindMapSaveMeta(event.data.payload);
        const isCurrentSaveResponse = !!requestRef.current
          && !!meta.requestId
          && meta.requestId === requestRef.current.id;
        if (shouldIgnoreMindMapSavePayload({
          payload: meta,
          activeRequestId: requestRef.current?.id ?? null,
          latestRevision: latestNativeRevisionRef.current,
          previousData: latestDataRef.current,
          nextData: (event.data.payload as { data?: unknown } | undefined)?.data,
          isCurrentSaveResponse,
        })) {
          if (meta.revision !== undefined) {
            latestNativeRevisionRef.current = meta.revision;
          }
          return;
        }
        const result = parseMindMapSavePayload(event.data.payload);
        if (meta.revision !== undefined) {
          latestNativeRevisionRef.current = meta.revision;
        }
        latestDataRef.current = result.data;
        onChange(result);
        if (requestRef.current && isCurrentSaveResponse) {
          window.clearTimeout(requestRef.current.timeout);
          requestRef.current.resolve(result);
          requestRef.current = null;
        }
      }
      if (event.data.type === "hostRequestSave") {
        requestMindMapHostSave();
      }
      if (event.data.type === "hostOpenHistory") {
        window.dispatchEvent(new CustomEvent("mindmap-host-open-history"));
      }
      if (event.data.type === "hostOpenEmbedManager") {
        window.dispatchEvent(new CustomEvent("mindmap-host-open-embed"));
      }
      if (event.data.type === "hostOpenAISettings") {
        window.dispatchEvent(new CustomEvent("mindmap-host-open-ai-settings"));
      }
      if (event.data.type === "hostBackToFiles") {
        window.dispatchEvent(new CustomEvent("mindmap-host-back-to-files"));
      }
      if (event.data.type === "saveMindMapConfig") {
        latestDataRef.current = {
          ...latestDataRef.current,
          config: event.data.payload as Record<string, unknown>,
        };
      }
      if (event.data.type === "saveLanguage") {
        latestDataRef.current = {
          ...latestDataRef.current,
          lang: typeof event.data.payload === "string" ? event.data.payload : latestDataRef.current.lang,
        };
      }
      if (event.data.type === "saveLocalConfig") {
        latestDataRef.current = {
          ...latestDataRef.current,
          localConfig: event.data.payload && typeof event.data.payload === "object"
            ? event.data.payload as Record<string, unknown>
            : null,
        };
      }
      if (event.data.type === "mindMapViewState") {
        const view = sanitizeMindMapView(event.data.payload);
        mindMapDebugLog("host.mindMapViewState", {
          fileId,
          view: describeMindMapView(view),
        });
        if (!view) return;
        if (fileId) {
          saveMindMapBrowserView(fileId, view);
        }
        latestDataRef.current = {
          ...latestDataRef.current,
          view,
        };
      }
      if (event.data.type === "mindMapScaleState") {
        const scale = (event.data.payload as { scale?: unknown } | undefined)?.scale;
        const nextView = mergeMindMapViewScale(latestDataRef.current.view, scale);
        mindMapDebugLog("host.mindMapScaleState", {
          fileId,
          scale,
          merged: !!nextView,
          view: describeMindMapView(nextView),
        });
        if (!nextView) return;
        if (fileId) {
          saveMindMapBrowserView(fileId, nextView);
        }
        latestDataRef.current = {
          ...latestDataRef.current,
          view: nextView,
        };
      }
      if (event.data.type === "mindMapDirtyState") {
        onChange({ data: latestDataRef.current, thumbnail: null });
      }
      if (event.data.type.startsWith("CLIPBOARD_")) {
        const payload = event.data.payload as { requestId?: string; text?: string; dataUrl?: string; type?: string } | undefined;
        const requestId = payload?.requestId;
        if (event.data.type === "CLIPBOARD_WRITE_TEXT") {
          void navigator.clipboard.writeText(payload?.text ?? "")
            .then(() => postClipboardResult("CLIPBOARD_RESULT", requestId, { ok: true }))
            .catch((error) => postClipboardResult("CLIPBOARD_RESULT", requestId, { ok: false, error: String(error) }));
        }
        if (event.data.type === "CLIPBOARD_READ_TEXT") {
          void navigator.clipboard.readText()
            .then((text) => postClipboardResult("CLIPBOARD_READ_RESULT", requestId, { ok: true, text }))
            .catch((error) => postClipboardResult("CLIPBOARD_READ_RESULT", requestId, { ok: false, error: String(error) }));
        }
        if (event.data.type === "CLIPBOARD_READ") {
          void navigator.clipboard.read()
            .then((items) => serializeClipboardItems(items))
            .then((items) => postClipboardResult("CLIPBOARD_READ_ITEMS_RESULT", requestId, { ok: true, items }))
            .catch((error) => postClipboardResult("CLIPBOARD_READ_ITEMS_RESULT", requestId, { ok: false, error: String(error) }));
        }
        if (event.data.type === "CLIPBOARD_WRITE_IMAGE") {
          void blobFromDataUrl(payload?.dataUrl ?? "")
            .then((blob) => navigator.clipboard.write([
              new ClipboardItem({ [payload?.type || blob.type || "image/png"]: blob }),
            ]))
            .then(() => postClipboardResult("CLIPBOARD_RESULT", requestId, { ok: true }))
            .catch((error) => postClipboardResult("CLIPBOARD_RESULT", requestId, { ok: false, error: String(error) }));
        }
      }
    }

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      if (requestRef.current) {
        window.clearTimeout(requestRef.current.timeout);
        requestRef.current.reject(new Error("MindMap host unmounted"));
        requestRef.current = null;
      }
    };
  }, [fileId, fullAIConfig, language, onChange, postClipboardResult, postToNative, requestSave]);

  return (
    <iframe
      ref={iframeRef}
      title="MindMap Editor"
      src={NATIVE_MINDMAP_URL}
      className="h-full w-full border-0 bg-white"
      allow="clipboard-read; clipboard-write"
    />
  );
}
