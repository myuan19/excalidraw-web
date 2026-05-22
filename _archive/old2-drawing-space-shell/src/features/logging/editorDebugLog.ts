import { postClientLog } from "./clientLogger";

const env = (import.meta as unknown as { env?: Record<string, string | boolean> }).env;

export function isEditorDebugEnabled(): boolean {
  if (env?.DEV === true) return true;
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return (
      params.get("editorDebug") === "1" ||
      window.localStorage.getItem("drawing-space-editor-debug") === "1"
    );
  } catch {
    return false;
  }
}

function serializePayload(data: unknown) {
  if (data instanceof Error) {
    return { name: data.name, message: data.message, stack: data.stack };
  }
  try {
    return JSON.parse(JSON.stringify(data ?? null));
  } catch {
    return { value: String(data) };
  }
}

/** 描述 DOM 节点尺寸，用于排查编辑器容器高度为 0 等问题 */
export function describeElementRect(el: HTMLElement | null | undefined) {
  if (!el) return { present: false };
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return {
    present: true,
    tag: el.tagName,
    id: el.id || undefined,
    className: el.className || undefined,
    rect: {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      top: Math.round(rect.top),
      left: Math.round(rect.left),
    },
    offset: { width: el.offsetWidth, height: el.offsetHeight },
    display: style.display,
    visibility: style.visibility,
    childCount: el.childElementCount,
  };
}

/**
 * 编辑器空白问题专用调试日志。
 * 开启：开发模式默认开启；或 localStorage `drawing-space-editor-debug=1`；或 URL `?editorDebug=1`
 */
export function editorDebugLog(phase: string, data?: unknown) {
  if (!isEditorDebugEnabled()) return;
  const payload = data === undefined ? undefined : serializePayload(data);
  const level = phase.includes("error") || phase.includes("fail") ? "error" : "info";
  console.log(`[DEBUG] editor-flow | ${phase}`, payload ?? "");
  void postClientLog({
    level,
    msg: `editor-flow:${phase}`,
    data: payload,
  });
}
