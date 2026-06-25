import { devDebug, isDevDebugChannelEnabled } from "../../lib/devDebug";
import { isDebugRuntimeEnabled } from "../../data/debugCapability";

const NOISY_BRIDGE_LABEL_PREFIXES = [
  "onMessage mindMapViewState",
  "onMessage mindMapDirtyState",
];

function isNoisyBridgeLabel(label: string): boolean {
  return NOISY_BRIDGE_LABEL_PREFIXES.some((prefix) => label.startsWith(prefix));
}

export function isMindMapBridgeDebugEnabled(): boolean {
  return isDevDebugChannelEnabled("mindmap-bridge");
}

export function debugMindMapBridge(
  label: string,
  data: Record<string, unknown> = {},
): void {
  if (isNoisyBridgeLabel(label) && !isDebugRuntimeEnabled()) {
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
