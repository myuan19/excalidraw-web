import {
  getDebugLoggingMode,
  isDebugLoggingEnabled,
  updateAppSettings,
} from "./appSettings";
import { apiTransport } from "./apiTransport";
import { isDesktopEditorHub } from "../lib/runtimePlatform";

export interface DebugCapability {
  loaded: boolean;
  allowed: boolean;
}

let capability: DebugCapability = {
  loaded: false,
  allowed: false,
};
let loading: Promise<DebugCapability> | null = null;

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // ignore listener failures
    }
  }
}

function setCapability(next: DebugCapability): DebugCapability {
  capability = next;
  if (!next.allowed && getDebugLoggingMode() !== "off") {
    updateAppSettings({ debugLoggingMode: "off" });
  } else if (
    next.allowed &&
    isDesktopEditorHub() &&
    getDebugLoggingMode() === "off"
  ) {
    // EDITORHUB_DESKTOP_DEBUG 启动时自动打开完整客户端诊断（Desktop 经 IPC 写 desktop-op.log）。
    updateAppSettings({ debugLoggingMode: "ai" });
  }
  if (typeof window !== "undefined") {
    if (next.allowed && getDebugLoggingMode() !== "off") {
      (window as { __MINDMAP_DEBUG__?: boolean }).__MINDMAP_DEBUG__ = true;
    } else if (!next.allowed) {
      delete (window as { __MINDMAP_DEBUG__?: boolean }).__MINDMAP_DEBUG__;
    }
  }
  notify();
  return capability;
}

export function getDebugCapability(): DebugCapability {
  return capability;
}

export function isDebugAllowed(): boolean {
  return capability.allowed;
}

export function isDebugRuntimeEnabled(): boolean {
  return isDebugAllowed() && isDebugLoggingEnabled();
}

export function subscribeDebugCapability(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function loadDebugCapability(): Promise<DebugCapability> {
  if (loading) {
    return loading;
  }
  loading = (async () => {
    try {
      const res = await apiTransport.request({
        method: "GET",
        path: "/api/debug/capability",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-store",
        },
      });
      if (res.status < 200 || res.status >= 300) {
        return setCapability({ loaded: true, allowed: false });
      }
      const data = JSON.parse(res.bodyText) as {
        debug?: { allowed?: boolean };
        allowed?: boolean;
      };
      return setCapability({
        loaded: true,
        allowed: data.debug?.allowed === true || data.allowed === true,
      });
    } catch {
      return setCapability({ loaded: true, allowed: false });
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export function setDebugLoggingEnabled(enabled: boolean): void {
  if (!isDebugAllowed()) {
    updateAppSettings({ debugLoggingMode: "off" });
    return;
  }
  updateAppSettings({ debugLoggingMode: enabled ? "ai" : "off" });
}
