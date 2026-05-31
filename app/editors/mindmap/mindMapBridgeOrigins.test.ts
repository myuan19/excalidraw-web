import { describe, expect, it } from "vitest";

import {
  getNativeMindMapTargetOrigin,
  isAllowedNativeMindMapMessageOrigin,
  isMindMapIframeDocumentComplete,
  NATIVE_MINDMAP_URL,
  resolveNativePostMessageTargetOrigin,
} from "./mindMapBridgeOrigins";

describe("mindMapBridgeOrigins", () => {
  it("uses the same /mind-map/index.html path in dev and prod", () => {
    expect(NATIVE_MINDMAP_URL).toBe("/mind-map/index.html");
  });

  it("resolves same-origin target for relative iframe path", () => {
    expect(getNativeMindMapTargetOrigin("http://localhost:3001")).toBe(
      "http://localhost:3001",
    );
    expect(
      isAllowedNativeMindMapMessageOrigin("http://localhost:3001", {
        hostOrigin: "http://localhost:3001",
        iframeSrc: "/mind-map/index.html",
      }),
    ).toBe(true);
    expect(
      isAllowedNativeMindMapMessageOrigin("http://evil.test", {
        hostOrigin: "http://localhost:3001",
        iframeSrc: "/mind-map/index.html",
      }),
    ).toBe(false);
  });

  it("resolves same-origin target before bridge ready when iframe location is readable", () => {
    const iframe = {
      src: "/mind-map/index.html",
      getAttribute: () => "/mind-map/index.html",
      contentWindow: {
        location: { origin: "http://localhost:3001" },
      },
    } as unknown as HTMLIFrameElement;

    expect(
      resolveNativePostMessageTargetOrigin(iframe, {
        hostOrigin: "http://localhost:3001",
        bridgeReady: false,
      }),
    ).toBe("http://localhost:3001");
  });

  it("uses host origin after iframe load", () => {
    const iframe = {
      src: "http://localhost:3001/mind-map/index.html",
      getAttribute: () => "/mind-map/index.html",
      contentWindow: {
        location: { origin: "http://localhost:3001", href: "http://localhost:3001/mind-map/index.html" },
      },
    } as unknown as HTMLIFrameElement;

    expect(
      resolveNativePostMessageTargetOrigin(iframe, {
        hostOrigin: "http://localhost:3001",
        bridgeReady: false,
        iframeLoaded: true,
      }),
    ).toBe("http://localhost:3001");
  });

  it("uses host origin after bridge ready", () => {
    const iframe = {
      src: "http://localhost:3001/mind-map/index.html",
      getAttribute: () => "/mind-map/index.html",
      contentWindow: {
        location: { origin: "http://localhost:3001" },
      },
    } as unknown as HTMLIFrameElement;

    expect(
      resolveNativePostMessageTargetOrigin(iframe, {
        hostOrigin: "http://localhost:3001",
        bridgeReady: true,
      }),
    ).toBe("http://localhost:3001");
  });

  it("detects a loaded same-origin iframe document", () => {
    const complete = {
      contentWindow: {},
      contentDocument: { readyState: "complete" },
    } as unknown as HTMLIFrameElement;
    const loading = {
      contentWindow: {},
      contentDocument: { readyState: "loading" },
    } as unknown as HTMLIFrameElement;

    expect(isMindMapIframeDocumentComplete(complete)).toBe(true);
    expect(isMindMapIframeDocumentComplete(loading)).toBe(false);
    expect(isMindMapIframeDocumentComplete(null)).toBe(false);
  });
});
