import { devDebug, isDevDebugChannelEnabled } from "../../lib/devDebug";

const NOISY_BRIDGE_LABEL_PREFIXES = [
  "onMessage mindMapViewState",
  "onMessage mindMapDirtyState",
];

function isVerboseBridgeDebugEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return (
      window.localStorage.getItem("mindmapBridgeVerboseDebug") === "1" ||
      window.localStorage.getItem("excalidraw-web-debug-mindmap-bridge-verbose") ===
        "1"
    );
  } catch {
    return false;
  }
}

function isNoisyBridgeLabel(label: string): boolean {
  return NOISY_BRIDGE_LABEL_PREFIXES.some((prefix) => label.startsWith(prefix));
}

export function isMindMapBridgeDebugEnabled(): boolean {
  if (isDevDebugChannelEnabled("mindmap-bridge")) {
    return true;
  }
  if (typeof window === "undefined") {
    return false;
  }
  if ((window as { __MINDMAP_DEBUG__?: boolean }).__MINDMAP_DEBUG__ === true) {
    return true;
  }
  try {
    return (
      window.localStorage.getItem("mindmapDebug") === "1" ||
      window.localStorage.getItem("excalidraw-web-debug-mindmap-bridge") === "1"
    );
  } catch {
    return false;
  }
}

export function debugMindMapBridge(
  label: string,
  data: Record<string, unknown> = {},
): void {
  if (isNoisyBridgeLabel(label) && !isVerboseBridgeDebugEnabled()) {
    return;
  }
  if (!isMindMapBridgeDebugEnabled()) {
    return;
  }
  devDebug("mindmap-bridge", label, data);
}

/** Always logged — bridge/save hard failures. */
export function warnMindMapBridge(
  label: string,
  data: Record<string, unknown> = {},
): void {
  console.warn(`[mindmap-bridge] ${label}`, {
    t: Math.round(performance.now()),
    ...data,
  });
}
