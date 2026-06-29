/**
 * 桌面端已知问题诊断：随 EDITORHUB_DESKTOP_DEBUG / 设置内调试日志写入 desktop-op.log。
 * 不依赖 DevTools；排查时在日志目录 grep 下列 pattern（PowerShell 示例）：
 *
 *   Select-String -Path "$env:LOCALAPPDATA\EditorHub\logs\desktop-op-*.log" -Pattern 'issue\.diag.*excalidraw\.drag'
 *   Select-String -Path ... -Pattern 'excalidraw\.drag \| geometry'
 *   Select-String -Path ... -Pattern 'excalidraw\.drag \| session\.(start|end)'
 *   Select-String -Path ... -Pattern 'drag\.perf'
 *
 * 区域：
 * - excalidraw.drag — Excalidraw 画布拖动卡顿 / 几何错配
 * - recent.flyout — 右上角「最近」列表显示
 * - sidebar.tree — 侧栏项目树点击/展开延迟
 * - home.render — 首页刚打开时连续闪烁
 * - filelist.sort — 列表按更新时间排序 / 保存后回弹
 */

import { createLogger } from "./logger";
import { isDebugRuntimeEnabled } from "../data/debugCapability";
import type { TracePhase } from "./userTrace";

const log = createLogger({ module: "issueDiag" });

export const ISSUE_DIAG_TAG = "issue.diag";

/** 日志文件 grep 用（与 desktop-op-*.log 中 event / details 字段对齐）。 */
export const ISSUE_DIAG_GREP = {
  all: String.raw`issue\.diag`,
  excalidrawDrag: String.raw`issue\.diag.*excalidraw\.drag|excalidraw\.drag \|`,
  excalidrawGeometry: String.raw`issue\.diag\.excalidraw\.drag\.geometry|excalidraw\.drag \| geometry`,
  excalidrawSession: String.raw`excalidraw\.drag \| session\.(start|end)|issue\.diag\.excalidraw\.drag\.session`,
  dragPerf: String.raw`drag\.perf`,
  libraryUrlImport: String.raw`library\.url-import|lib-url-import`,
} as const;

/** Desktop：经 IPC 直写 desktop-op.log（不依赖 /api/logs 批处理延迟）。 */
function notifyDesktopIssueDiag(
  area: IssueDiagArea,
  action: string,
  phase: TracePhase,
  data?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") {
    return;
  }
  const issueDiag = window.editorHubDesktop?.issueDiag;
  if (typeof issueDiag !== "function") {
    return;
  }
  try {
    void issueDiag({
      area,
      action,
      phase,
      data: { tag: ISSUE_DIAG_TAG, area, action, phase, ...data },
    }).catch(() => {});
  } catch {
    /* 监控不得影响业务 */
  }
}

export type IssueDiagArea =
  | "excalidraw.drag"
  | "desktop.close"
  | "recent.flyout"
  | "sidebar.tree"
  | "home.render"
  | "filelist.sort"
  | "library.url-import";

export function traceIssueDiag(
  area: IssueDiagArea,
  action: string,
  data?: Record<string, unknown>,
  phase: TracePhase = "start",
): void {
  if (!isDebugRuntimeEnabled()) {
    return;
  }
  const payload = { tag: ISSUE_DIAG_TAG, area, action, phase, ...data };
  notifyDesktopIssueDiag(area, action, phase, payload);
  if (phase === "fail") {
    log.warn(`${area} | ${action}`, payload);
    return;
  }
  log.info(`${area} | ${action}`, payload);
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

/**
 * 真实绘制帧率监控：用 requestAnimationFrame 连续测量帧间隔。
 * 与 onChange 驱动的 frameGap 不同，rAF 即使在没有 onChange 时也会触发，
 * 因此能反映合成/主线程被阻塞导致的“掉帧”。60fps ≈ 16.7ms/帧。
 */
type RafFrameMonitor = {
  rafId: number | null;
  lastTs: number;
  startedAt: number;
  frameCount: number;
  jankFrameCount: number; // 帧间隔 > 24ms（掉 ≥1 帧）
  severeJankCount: number; // 帧间隔 > 50ms（明显卡顿）
  maxGapMs: number;
  sumGapMs: number;
};

let excalRafMonitor: RafFrameMonitor | null = null;

function startExcalidrawRafFrameMonitor(): void {
  stopExcalidrawRafFrameMonitor();
  if (!isDebugRuntimeEnabled() || typeof requestAnimationFrame === "undefined") {
    return;
  }
  const monitor: RafFrameMonitor = {
    rafId: null,
    lastTs: 0,
    startedAt: performance.now(),
    frameCount: 0,
    jankFrameCount: 0,
    severeJankCount: 0,
    maxGapMs: 0,
    sumGapMs: 0,
  };
  excalRafMonitor = monitor;
  const tick = (ts: number) => {
    if (excalRafMonitor !== monitor) {
      return;
    }
    if (monitor.lastTs > 0) {
      const gap = ts - monitor.lastTs;
      monitor.frameCount += 1;
      monitor.sumGapMs += gap;
      monitor.maxGapMs = Math.max(monitor.maxGapMs, gap);
      if (gap > 50) {
        monitor.severeJankCount += 1;
      } else if (gap > 24) {
        monitor.jankFrameCount += 1;
      }
    }
    monitor.lastTs = ts;
    monitor.rafId = requestAnimationFrame(tick);
  };
  monitor.rafId = requestAnimationFrame(tick);
}

function stopExcalidrawRafFrameMonitor(): Record<string, number> | null {
  const monitor = excalRafMonitor;
  excalRafMonitor = null;
  if (!monitor) {
    return null;
  }
  if (monitor.rafId != null && typeof cancelAnimationFrame !== "undefined") {
    cancelAnimationFrame(monitor.rafId);
  }
  const elapsed = Math.max(1, performance.now() - monitor.startedAt);
  return {
    rafFrameCount: monitor.frameCount,
    rafJankFrameCount: monitor.jankFrameCount,
    rafSevereJankCount: monitor.severeJankCount,
    rafMaxGapMs: Math.round(monitor.maxGapMs),
    rafAvgGapMs:
      monitor.frameCount > 0
        ? Math.round(monitor.sumGapMs / monitor.frameCount)
        : 0,
    rafAvgFps: Math.round((monitor.frameCount / elapsed) * 1000),
  };
}

/** 通知桌面主进程开始/结束拖动资源采样（仅 Electron + debug；非阻塞）。 */
function notifyDesktopDragPerf(
  phase: "start" | "end",
  sessionId: number,
  raf?: Record<string, number> | null,
): void {
  if (typeof window === "undefined") {
    return;
  }
  const dragPerf = window.editorHubDesktop?.dragPerf;
  if (typeof dragPerf !== "function") {
    return;
  }
  try {
    void dragPerf({ phase, sessionId, raf: raf ?? null }).catch(() => {});
  } catch {
    /* 监控不得影响业务 */
  }
}

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
  startExcalidrawRafFrameMonitor();
  notifyDesktopDragPerf("start", excalDragSessionId);
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
  const rafStats = stopExcalidrawRafFrameMonitor();
  if (!excalDragSession) {
    return;
  }
  const session = excalDragSession;
  excalDragSession = null;
  notifyDesktopDragPerf("end", session.id, rafStats);
  const rafHasJank =
    rafStats != null &&
    ((rafStats.rafSevereJankCount ?? 0) > 0 ||
      (rafStats.rafJankFrameCount ?? 0) > 2);
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
      ...(rafStats ?? {}),
      ...data,
    },
    session.slowChangeCount > 0 ||
      session.slowStageCount > 0 ||
      session.jankFrameCount > 0 ||
      session.longTaskCount > 0 ||
      rafHasJank
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
