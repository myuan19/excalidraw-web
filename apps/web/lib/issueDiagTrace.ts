/**
 * 桌面端已知问题诊断：在 desktop-op.log 中 grep `issue.diag`。
 *
 * 区域：
 * - excalidraw.drag — Excalidraw 画布拖动卡顿
 * - recent.flyout — 右上角「最近」列表显示
 * - sidebar.tree — 侧栏项目树点击/展开延迟
 * - home.render — 首页刚打开时连续闪烁
 * - filelist.sort — 列表按更新时间排序 / 保存后回弹
 */

import { createLogger } from "./logger";
import { isDebugRuntimeEnabled } from "../data/debugCapability";
import { traceUserAction, type TracePhase } from "./userTrace";

const log = createLogger({ module: "issueDiag" });

export const ISSUE_DIAG_TAG = "issue.diag";

export type IssueDiagArea =
  | "excalidraw.drag"
  | "desktop.close"
  | "recent.flyout"
  | "sidebar.tree"
  | "home.render"
  | "filelist.sort";

export function traceIssueDiag(
  area: IssueDiagArea,
  action: string,
  data?: Record<string, unknown>,
  phase: TracePhase = "start",
): void {
  const payload = { tag: ISSUE_DIAG_TAG, area, ...data };
  traceUserAction(`${ISSUE_DIAG_TAG}.${area}`, action, payload, phase);
  if (phase === "fail") {
    log.warn(`${area} | ${action}`, payload);
    return;
  }
  log.debug(`${area} | ${action}`, payload);
}

export function startIssueDiagTimer(
  area: IssueDiagArea,
  action: string,
  data?: Record<string, unknown>,
) {
  const t0 = performance.now();
  traceIssueDiag(area, action, { ...data, timer: "start" }, "start");
  return (
    extra?: Record<string, unknown>,
    phase: Exclude<TracePhase, "start"> = "ok",
  ) => {
    traceIssueDiag(
      area,
      action,
      { ...data, ...extra, ms: Math.round(performance.now() - t0) },
      phase,
    );
  };
}

let homeRenderSeq = 0;
let homeMountAt: number | null = null;

export function traceHomeRenderMount(data?: Record<string, unknown>): void {
  homeMountAt = performance.now();
  homeRenderSeq += 1;
  traceIssueDiag("home.render", "mount", { homeRenderSeq, ...data }, "start");
}

export function traceHomeRenderPaint(
  reason: string,
  data?: Record<string, unknown>,
): void {
  traceIssueDiag(
    "home.render",
    "paint",
    {
      reason,
      homeRenderSeq,
      sinceMountMs:
        homeMountAt != null
          ? Math.round(performance.now() - homeMountAt)
          : null,
      ...data,
    },
    "branch",
  );
}

export function traceFileListSortOrder(
  action: string,
  data?: Record<string, unknown>,
  phase: TracePhase = "branch",
): void {
  traceIssueDiag("filelist.sort", action, data, phase);
}

type ExcalDragSession = {
  id: number;
  changeCount: number;
  lastChangeAt: number;
  firstChangeAt: number;
  slowChangeCount: number;
  slowStageCount: number;
  maxDeltaMs: number;
  maxHandleMs: number;
  jankFrameCount: number;
  maxFrameGapMs: number;
  longTaskCount: number;
  maxLongTaskMs: number;
};

let excalDragSession: ExcalDragSession | null = null;
let excalDragSessionId = 0;
let excalDragLongTaskObserver: PerformanceObserver | null = null;

/** Drag diagnostics aggregate in-memory only; IPC at session.end to avoid amplifying jank. */
const EXCAL_DRAG_DIAG_SILENT = true;

function stopExcalidrawDragLongTaskMonitor(): void {
  excalDragLongTaskObserver?.disconnect();
  excalDragLongTaskObserver = null;
}

function startExcalidrawDragLongTaskMonitor(): void {
  if (!isDebugRuntimeEnabled()) {
    return;
  }
  stopExcalidrawDragLongTaskMonitor();
  if (typeof PerformanceObserver === "undefined") {
    return;
  }
  try {
    excalDragLongTaskObserver = new PerformanceObserver((list) => {
      if (!excalDragSession) {
        return;
      }
      for (const entry of list.getEntries()) {
        const durationMs = Math.round(entry.duration);
        excalDragSession.longTaskCount += 1;
        excalDragSession.maxLongTaskMs = Math.max(
          excalDragSession.maxLongTaskMs,
          durationMs,
        );
        if (!EXCAL_DRAG_DIAG_SILENT) {
          traceIssueDiag(
            "excalidraw.drag",
            "longtask",
            {
              sessionId: excalDragSession.id,
              durationMs,
              name: entry.name,
              longTaskCount: excalDragSession.longTaskCount,
            },
            durationMs > 50 ? "fail" : "branch",
          );
        }
      }
    });
    excalDragLongTaskObserver.observe({ entryTypes: ["longtask"] });
  } catch {
    stopExcalidrawDragLongTaskMonitor();
  }
}

function recordExcalidrawDragFrameGap(deltaMs: number): void {
  if (!excalDragSession) {
    return;
  }
  excalDragSession.maxFrameGapMs = Math.max(
    excalDragSession.maxFrameGapMs,
    deltaMs,
  );
  if (deltaMs <= 32) {
    return;
  }
  excalDragSession.jankFrameCount += 1;
}

export function traceExcalidrawDragPointer(
  kind: "down" | "move" | "up",
  data?: Record<string, unknown>,
): void {
  if (kind !== "down") {
    return;
  }
  excalDragSessionId += 1;
  excalDragSession = {
    id: excalDragSessionId,
    changeCount: 0,
    lastChangeAt: performance.now(),
    firstChangeAt: performance.now(),
    slowChangeCount: 0,
    slowStageCount: 0,
    maxDeltaMs: 0,
    maxHandleMs: 0,
    jankFrameCount: 0,
    maxFrameGapMs: 0,
    longTaskCount: 0,
    maxLongTaskMs: 0,
  };
  startExcalidrawDragLongTaskMonitor();
  traceIssueDiag(
    "excalidraw.drag",
    "session.start",
    { sessionId: excalDragSessionId, ...data },
    "start",
  );
}

export function getExcalidrawDragSessionId(): number | null {
  return excalDragSession?.id ?? null;
}

export function traceExcalidrawDragStage(
  action: string,
  data?: Record<string, unknown>,
  phase: TracePhase = "branch",
): void {
  const stageMs =
    typeof data?.ms === "number"
      ? Math.round(data.ms)
      : typeof data?.totalMs === "number"
      ? Math.round(data.totalMs)
      : null;
  const sessionId = getExcalidrawDragSessionId();
  if (excalDragSession && stageMs != null && stageMs > 16) {
    excalDragSession.slowStageCount += 1;
  }
  traceIssueDiag(
    "excalidraw.drag",
    action,
    {
      sessionId,
      ...data,
    },
    stageMs != null && stageMs > 16 ? "fail" : phase,
  );
}

export function traceExcalidrawDragSessionEnd(
  data?: Record<string, unknown>,
): void {
  stopExcalidrawDragLongTaskMonitor();
  if (!excalDragSession) {
    return;
  }
  const session = excalDragSession;
  excalDragSession = null;
  traceIssueDiag(
    "excalidraw.drag",
    "session.end",
    {
      sessionId: session.id,
      changeCount: session.changeCount,
      slowChangeCount: session.slowChangeCount,
      slowStageCount: session.slowStageCount,
      jankFrameCount: session.jankFrameCount,
      maxFrameGapMs: session.maxFrameGapMs,
      longTaskCount: session.longTaskCount,
      maxLongTaskMs: session.maxLongTaskMs,
      maxDeltaMs: session.maxDeltaMs,
      maxHandleMs: session.maxHandleMs,
      durationMs: Math.round(performance.now() - session.firstChangeAt),
      ...data,
    },
    session.slowChangeCount > 0 ||
      session.slowStageCount > 0 ||
      session.jankFrameCount > 0 ||
      session.longTaskCount > 0
      ? "fail"
      : "ok",
  );
}

export function traceExcalidrawHostWorkDeferred(
  action: string,
  data?: Record<string, unknown>,
): void {
  if (!isDebugRuntimeEnabled() || EXCAL_DRAG_DIAG_SILENT) {
    return;
  }
  traceIssueDiag("excalidraw.drag", action, data, "branch");
}

/** Hot-path counter updates during pointer drag; no IPC until session.end. */
export function recordExcalidrawDragHostChange(handleMs?: number): void {
  if (!excalDragSession) {
    return;
  }
  const session = excalDragSession;
  session.changeCount += 1;
  const now = performance.now();
  const deltaMs = Math.round(now - session.lastChangeAt);
  session.lastChangeAt = now;
  recordExcalidrawDragFrameGap(deltaMs);
  const roundedHandleMs =
    handleMs != null ? Math.round(handleMs) : null;
  if (roundedHandleMs != null && roundedHandleMs > 8) {
    session.slowChangeCount += 1;
  }
  session.maxDeltaMs = Math.max(session.maxDeltaMs, deltaMs);
  if (roundedHandleMs != null) {
    session.maxHandleMs = Math.max(session.maxHandleMs, roundedHandleMs);
  }
}

export function traceExcalidrawDragChange(
  data?: Record<string, unknown>,
): void {
  const handleMs =
    typeof data?.handleMs === "number" ? Math.round(data.handleMs) : undefined;
  recordExcalidrawDragHostChange(handleMs);
  if (!excalDragSession || EXCAL_DRAG_DIAG_SILENT) {
    return;
  }
  const session = excalDragSession;
  const deltaMs = session.maxDeltaMs;
  if (
    session.changeCount === 1 ||
    session.changeCount % 8 === 0 ||
    deltaMs > 24 ||
    (handleMs != null && handleMs > 4)
  ) {
    traceIssueDiag(
      "excalidraw.drag",
      "onChange.sample",
      {
        sessionId: session.id,
        changeCount: session.changeCount,
        deltaMs,
        ...data,
      },
      handleMs != null && handleMs > 4 ? "fail" : "branch",
    );
  }
}
