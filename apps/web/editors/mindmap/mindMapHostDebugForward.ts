type MindMapHostDebugForwardFn = (
  scope: string,
  label: string,
  data?: Record<string, unknown>,
) => void;

let forwardFn: MindMapHostDebugForwardFn | null = null;
let forwarding = false;

/** 将宿主诊断日志转发到 iframe 控制台，便于与 mindmap-load 日志合并排查。 */
export function installMindMapHostDebugForward(
  postToNative: (type: string, payload?: unknown) => boolean,
): void {
  forwardFn = (scope, label, data) => {
    postToNative("mindMapHostDebug", { scope, label, data });
  };
}

export function clearMindMapHostDebugForward(): void {
  forwardFn = null;
}

export function forwardMindMapHostDebug(
  scope: string,
  label: string,
  data?: Record<string, unknown>,
): void {
  if (forwarding || !forwardFn) {
    return;
  }
  forwarding = true;
  try {
    forwardFn(scope, label, data);
  } finally {
    forwarding = false;
  }
}
