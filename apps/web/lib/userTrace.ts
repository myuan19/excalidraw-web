/**
 * 用户操作追踪：统一 `[DEBUG] user-trace | area | action | phase` 前缀。
 * 同时写入 devDebug（控制台）与 createLogger（Web: POST /api/logs；Desktop: IPC → desktop-op.log）。
 *
 * 启用方式：
 * - Desktop：`EDITORHUB_DESKTOP_DEBUG=1` 启动（自动开启调试日志）
 * - URL `?debug=1`（需服务端允许 debug）
 * - 控制台：`window.__EDITORHUB_DEBUG__.enable()`
 */

import { devDebug } from "./devDebug";
import { createLogger } from "./logger";
import { enableResourceTracePersistence, mergeResourceTraceGlobals } from "./resourceTrace";
import { getThumbPipelineTraceSummary } from "./thumbPipelineTrace";
import { getTabCacheTraceSummary } from "./editorTabCacheTrace";
import { isDebugAllowed } from "../data/debugCapability";
import { updateAppSettings } from "../data/appSettings";

const traceLog = createLogger({ module: "userTrace" });

const SESSION_KEY = "excalidraw-user-trace-sid";

export type TracePhase = "start" | "ok" | "fail" | "skip" | "branch";

function getSessionId(): string {
  if (typeof window === "undefined") {
    return "ssr";
  }
  try {
    let sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = crypto.randomUUID?.() ?? String(Date.now());
      sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid.slice(0, 8);
  } catch {
    return String(Date.now()).slice(-8);
  }
}

function buildPayload(
  data: Record<string, unknown> | undefined,
  phase: TracePhase,
): Record<string, unknown> {
  return {
    phase,
    sid: getSessionId(),
    ...(data ?? {}),
  };
}

/** 记录用户操作或系统对用户操作的响应。 */
export function traceUserAction(
  area: string,
  action: string,
  data?: Record<string, unknown>,
  phase: TracePhase = "start",
): void {
  const label = `${area} | ${action} | ${phase}`;
  const payload = buildPayload(data, phase);
  devDebug("user-trace", label, payload);
  if (phase === "fail") {
    traceLog.warn(label, payload);
    return;
  }
  traceLog.debug(label, payload);
}

/** 记录失败路径（含堆栈摘要）。 */
export function traceUserError(
  area: string,
  action: string,
  error: unknown,
  data?: Record<string, unknown>,
): void {
  const err =
    error instanceof Error
      ? {
          message: error.message,
          name: error.name,
          stack: error.stack?.split("\n").slice(0, 8).join("\n"),
        }
      : { value: String(error) };
  traceUserAction(area, action, { ...data, error: err }, "fail");
}

/** 一键开启全量调试：设置内调试日志 + 远程 ingest（需服务端允许 debug）。 */
export function enableFullDebugMode(): void {
  if (typeof window === "undefined") {
    return;
  }
  if (!isDebugAllowed()) {
    console.warn("[DEBUG] user-trace | enableFullDebugMode | denied", {
      sid: getSessionId(),
      hint: "Server debug capability not allowed.",
    });
    return;
  }
  try {
    updateAppSettings({ debugLoggingMode: "ai" });
    localStorage.removeItem("excalidraw-log-remote");
    (window as { __MINDMAP_DEBUG__?: boolean }).__MINDMAP_DEBUG__ = true;
    enableResourceTracePersistence();
  } catch {
    /* ignore */
  }
  console.warn("[DEBUG] user-trace | enableFullDebugMode | ok", {
    sid: getSessionId(),
    hint: "Reload the page, then reproduce your steps.",
  });
}

export type EditorHubDebugGlobals = {
  enable: () => void;
  trace: typeof traceUserAction;
  sessionId: string;
  resourceSummary: () => Record<string, unknown>;
  thumbPipelineSummary: () => Record<string, unknown>;
  tabCacheSummary: () => Record<string, unknown>;
  enableResourceTrace: () => void;
};

declare global {
  interface Window {
    __EDITORHUB_DEBUG__?: EditorHubDebugGlobals;
  }
}

/** App 启动时调用：暴露调试 API，并在 ?debug=1 时自动开启。 */
export function installUserTraceGlobals(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.__EDITORHUB_DEBUG__ = mergeResourceTraceGlobals({
    enable: enableFullDebugMode,
    trace: traceUserAction,
    sessionId: getSessionId(),
    thumbPipelineSummary: getThumbPipelineTraceSummary,
    tabCacheSummary: getTabCacheTraceSummary,
  }) as EditorHubDebugGlobals;
  if (new URLSearchParams(window.location.search).get("debug") === "1") {
    enableFullDebugMode();
  }
  traceUserAction("boot", "installUserTraceGlobals", {
    hash: window.location.hash,
    search: window.location.search,
    href: window.location.href,
  }, "ok");
}
