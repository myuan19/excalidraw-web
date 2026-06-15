/** Same path in dev and prod — served from `public/mind-map/` via Vite/static host. */
export const NATIVE_MINDMAP_URL = "/mind-map/index.html";

/** Same-origin iframe only — used to recover bridge after host state reset. */
export function isMindMapIframeDocumentComplete(
  iframe: HTMLIFrameElement | null | undefined,
): boolean {
  if (!iframe?.contentWindow) {
    return false;
  }
  try {
    return iframe.contentDocument?.readyState === "complete";
  } catch {
    return false;
  }
}

export function parseMindMapIframeOrigin(
  iframeSrc: string | null | undefined,
  hostOrigin: string,
): string | null {
  if (!iframeSrc) {
    return null;
  }
  try {
    return new URL(iframeSrc, hostOrigin).origin;
  } catch {
    return null;
  }
}

function originFromMindMapUrl(url: string, hostOrigin: string): string | null {
  return parseMindMapIframeOrigin(url, hostOrigin);
}

/** postMessage targetOrigin derived from configured iframe URL. */
export function getNativeMindMapTargetOrigin(
  hostOrigin: string = typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost",
): string {
  return originFromMindMapUrl(NATIVE_MINDMAP_URL, hostOrigin) ?? hostOrigin;
}

export type ResolveNativePostMessageTargetOriginOptions = {
  hostOrigin?: string;
  bridgeReady?: boolean;
  /** Host iframe `onLoad` fired — cross-origin target is known from `src`. */
  iframeLoaded?: boolean;
  learnedOrigin?: string | null;
};

/**
 * Resolve postMessage targetOrigin.
 * Before iframe load, skip cross-origin posts while iframe is still about:blank.
 */
export function resolveNativePostMessageTargetOrigin(
  iframe: HTMLIFrameElement | null | undefined,
  options: ResolveNativePostMessageTargetOriginOptions = {},
): string | null {
  const hostOrigin =
    options.hostOrigin ??
    (typeof window !== "undefined" ? window.location.origin : "http://localhost");
  const bridgeReady = options.bridgeReady === true;
  const iframeLoaded =
    options.iframeLoaded === true ||
    isMindMapIframeDocumentComplete(iframe);
  const iframeSrc = iframe?.getAttribute("src") ?? iframe?.src ?? NATIVE_MINDMAP_URL;
  const iframeOrigin =
    options.learnedOrigin ?? parseMindMapIframeOrigin(iframeSrc, hostOrigin);
  const configuredOrigin = getNativeMindMapTargetOrigin(hostOrigin);
  const expectedOrigin = iframeOrigin ?? configuredOrigin;
  const targetWindow = iframe?.contentWindow;

  if (!targetWindow) {
    return null;
  }

  if (bridgeReady || iframeLoaded) {
    return expectedOrigin;
  }

  try {
    const liveOrigin = targetWindow.location.origin;
    if (!liveOrigin || liveOrigin === "null") {
      return null;
    }
    if (expectedOrigin !== hostOrigin && liveOrigin === hostOrigin) {
      return null;
    }
    return liveOrigin;
  } catch {
    return null;
  }
}

export type IsAllowedNativeMindMapMessageOriginOptions = {
  hostOrigin?: string;
  iframeSrc?: string | null;
  learnedOrigin?: string | null;
};

/** Accept iframe messages from same-origin /mind-map/ embed. */
export function isAllowedNativeMindMapMessageOrigin(
  messageOrigin: string,
  options: IsAllowedNativeMindMapMessageOriginOptions = {},
): boolean {
  const hostOrigin =
    options.hostOrigin ??
    (typeof window !== "undefined" ? window.location.origin : "http://localhost");
  const allowed = new Set<string>([hostOrigin, getNativeMindMapTargetOrigin(hostOrigin)]);
  const iframeOrigin = parseMindMapIframeOrigin(
    options.iframeSrc ?? NATIVE_MINDMAP_URL,
    hostOrigin,
  );
  if (iframeOrigin) {
    allowed.add(iframeOrigin);
  }
  if (options.learnedOrigin) {
    allowed.add(options.learnedOrigin);
  }
  return allowed.has(messageOrigin);
}

/** Parent origin when MindMap runs in a cross-origin iframe (Vue dev server). */
export function getMindMapHostTargetOrigin(): string {
  if (typeof window === "undefined") {
    return "http://localhost";
  }
  try {
    if (document.referrer) {
      return new URL(document.referrer).origin;
    }
  } catch {
    // fall through
  }
  return window.location.origin;
}

export function describeMindMapBridgeState(input: {
  hostOrigin: string;
  iframeSrc?: string | null;
  bridgeReady: boolean;
  appInited: boolean;
  learnedOrigin?: string | null;
  hasContentWindow?: boolean;
}): Record<string, unknown> {
  const iframeOrigin = parseMindMapIframeOrigin(
    input.iframeSrc ?? NATIVE_MINDMAP_URL,
    input.hostOrigin,
  );
  const configuredOrigin = getNativeMindMapTargetOrigin(input.hostOrigin);
  const expectedOrigin = input.learnedOrigin ?? iframeOrigin ?? configuredOrigin;
  return {
    configuredUrl: NATIVE_MINDMAP_URL,
    iframeSrc: input.iframeSrc ?? null,
    hostOrigin: input.hostOrigin,
    iframeOrigin,
    configuredOrigin,
    learnedOrigin: input.learnedOrigin ?? null,
    bridgeReady: input.bridgeReady,
    appInited: input.appInited,
    hasContentWindow: input.hasContentWindow ?? false,
    expectedPostMessageOrigin: input.bridgeReady ? expectedOrigin : null,
  };
}
