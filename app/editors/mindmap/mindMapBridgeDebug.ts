export function isMindMapBridgeDebugEnabled(): boolean {
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
  if (!isMindMapBridgeDebugEnabled()) {
    return;
  }
  console.log(
    `[DEBUG] mindmap-bridge | ${label}`,
    JSON.stringify(
      {
        t: Math.round(performance.now()),
        ...data,
      },
      null,
      2,
    ),
  );
}

/** Always logged — bridge/save hard failures. */
export function warnMindMapBridge(
  label: string,
  data: Record<string, unknown> = {},
): void {
  console.warn(
    `[DEBUG] mindmap-bridge | ${label}`,
    {
      t: Math.round(performance.now()),
      ...data,
    },
  );
}
