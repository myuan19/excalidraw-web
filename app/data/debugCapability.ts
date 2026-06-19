import {
  getDebugLoggingMode,
  isDebugLoggingEnabled,
  updateAppSettings,
} from "./appSettings";

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
      // ignore
    }
  }
}

function setCapability(next: DebugCapability): DebugCapability {
  capability = next;
  if (!next.allowed && getDebugLoggingMode() !== "off") {
    updateAppSettings({ debugLoggingMode: "off" });
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
      const res = await fetch("/api/debug/capability", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        return setCapability({ loaded: true, allowed: false });
      }
      const data = (await res.json()) as {
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
