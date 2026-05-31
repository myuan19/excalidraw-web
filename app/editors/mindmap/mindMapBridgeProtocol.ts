import type { MindMapDocumentData } from "../../data/formats/MindMapAdapter";

/** postMessage `source` from the host editor shell. */
export const MINDMAP_HOST_SOURCE = "excalidraw-web" as const;

/** postMessage `source` from the MindMap iframe bridge runtime. */
export const MINDMAP_NATIVE_SOURCE = "simple-mind-map-native" as const;

export const MINDMAP_APP_INIT_TIMEOUT_MS = 15_000;
export const MINDMAP_BRIDGE_MOUNT_TIMEOUT_MS = 20_000;
export const MINDMAP_MAX_CHUNK_RELOAD_ATTEMPTS = 2;

/** Host-side session phases (single source of truth for bridge lifecycle). */
export type MindMapHostBridgePhase =
  | "idle"
  | "mounting"
  | "bridge_ready"
  | "init_sent"
  | "app_ready"
  | "failed";

export type MindMapIframeFailureKind =
  | "script"
  | "runtime-blocked"
  | "runtime-timeout"
  | "chunk-load"
  | "error"
  | "unhandledrejection"
  | "unknown";

export type MindMapIframeFailurePayload = {
  kind?: string;
  message?: string;
  source?: string;
  lineno?: number;
  colno?: number;
  stack?: string;
};

export type NativeMindMapBridgePayload = {
  mindMapData: MindMapDocumentData;
  mindMapConfig: Record<string, unknown>;
  lang: string;
  localConfig: Record<string, unknown> | null;
};

export type NativeMindMapMessage =
  | {
      source: typeof MINDMAP_NATIVE_SOURCE;
      type: "ready" | "appInited";
      payload?: unknown;
    }
  | {
      source: typeof MINDMAP_NATIVE_SOURCE;
      type: "saveMindMapData";
      payload: unknown;
    }
  | {
      source: typeof MINDMAP_NATIVE_SOURCE;
      type: "saveMindMapThumbnail";
      payload: unknown;
    }
  | {
      source: typeof MINDMAP_NATIVE_SOURCE;
      type:
        | "saveMindMapConfig"
        | "saveLocalConfig"
        | "saveLanguage"
        | "mindMapDirtyState"
        | "mindMapViewState";
      payload: unknown;
    }
  | {
      source: typeof MINDMAP_NATIVE_SOURCE;
      type: "mindMapIframeError";
      payload?: MindMapIframeFailurePayload;
    }
  | {
      source: typeof MINDMAP_NATIVE_SOURCE;
      type:
        | "hostBackToFiles"
        | "hostRequestSave"
        | "hostOpenEmbedManager"
        | "hostOpenAISettings"
        | "hostOpenHistory"
        | "CLIPBOARD_WRITE_TEXT"
        | "CLIPBOARD_READ_TEXT"
        | "CLIPBOARD_READ"
        | "CLIPBOARD_WRITE_IMAGE";
      payload?: unknown;
    };

export type MindMapIframeFailureClassification = {
  kind: MindMapIframeFailureKind;
  recoverable: boolean;
  userMessage: string;
};

export const MINDMAP_STATIC_DEPLOY_ERROR_MESSAGE =
  "mindmap 静态资源未正确部署：/mind-map/dist/js/ 须以 application/javascript 返回（勿 SPA 回退为 HTML、勿 OAuth 拦截）。请 yarn build:production 后整包部署 app/build/mind-map/，网关放行 /mind-map/dist/。";

const STATIC_DEPLOY_KINDS = new Set<MindMapIframeFailureKind>([
  "script",
  "runtime-blocked",
  "runtime-timeout",
]);

export function isNativeMindMapMessage(
  value: unknown,
): value is NativeMindMapMessage {
  return (
    value !== null &&
    typeof value === "object" &&
    (value as { source?: unknown }).source === MINDMAP_NATIVE_SOURCE &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

export function parseIframeFailureKind(
  payload: MindMapIframeFailurePayload | null | undefined,
): MindMapIframeFailureKind {
  const raw = payload?.kind;
  if (raw === "script") return "script";
  if (raw === "runtime-blocked") return "runtime-blocked";
  if (raw === "runtime-timeout") return "runtime-timeout";
  if (raw === "chunk-load" || raw === "unhandledrejection") {
    const message = payload?.message ?? "";
    if (
      (payload?.message && /ChunkLoadError|Loading chunk/i.test(message)) ||
      /代码块加载失败/i.test(message) ||
      /ERR_HTTP2_PROTOCOL_ERROR/i.test(message)
    ) {
      return "chunk-load";
    }
    return raw === "unhandledrejection" ? "unhandledrejection" : "chunk-load";
  }
  if (raw === "error") return "error";
  return "unknown";
}

export function classifyMindMapIframeFailure(
  payload: MindMapIframeFailurePayload | Record<string, unknown> | null | undefined,
): MindMapIframeFailureClassification {
  const normalized: MindMapIframeFailurePayload | null =
    payload && typeof payload === "object"
      ? (payload as MindMapIframeFailurePayload)
      : null;
  const message = normalized?.message ?? "MindMap iframe runtime error";
  const kind = parseIframeFailureKind(normalized);

  if (STATIC_DEPLOY_KINDS.has(kind)) {
    return {
      kind,
      recoverable: false,
      userMessage: MINDMAP_STATIC_DEPLOY_ERROR_MESSAGE,
    };
  }

  if (kind === "chunk-load") {
    return {
      kind,
      recoverable: true,
      userMessage: `mindmap 代码块加载失败：${message}`,
    };
  }

  const source = normalized?.source?.split("/").slice(-2).join("/");
  return {
    kind,
    recoverable: false,
    userMessage: source
      ? `mindmap 原生界面加载失败：${message}（${source}）`
      : `mindmap 原生界面加载失败：${message}`,
  };
}

export function isBridgeReadyPhase(phase: MindMapHostBridgePhase): boolean {
  return (
    phase === "bridge_ready" ||
    phase === "init_sent" ||
    phase === "app_ready"
  );
}

export function isAppReadyPhase(phase: MindMapHostBridgePhase): boolean {
  return phase === "app_ready";
}
