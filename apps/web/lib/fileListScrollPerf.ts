/**
 * File list scroll / render performance sampling.
 *
 * Enable with the same switches as resource trace:
 * - `localStorage.setItem('excalidraw-resource-trace', '1')` then reload
 * - Desktop: `EDITORHUB_DESKTOP_DEBUG=1`
 * - Summary: `window.__EDITORHUB_DEBUG__.resourceSummary()` or `.fileListScrollSummary()`
 */

import { isResourceTraceEnabled } from "./resourceTrace";
import { devDebug } from "./devDebug";
import { FILE_LIST_LARGE_DOM_THRESHOLD } from "./fileListGridLayout";

const FPS_SAMPLE_MS = 250;
const LONG_TASK_MS = 50;
const SCROLL_SUMMARY_IDLE_MS = 400;

type ScrollSession = {
  startedAt: number;
  frames: number;
  lastFrameAt: number;
  minFps: number;
  listedFiles: number;
  domCards: number;
  virtualized: boolean;
};

type FileListScrollStats = {
  scrollSessions: number;
  worstFps: number | null;
  avgFps: number | null;
  longTasks: number;
  worstLongTaskMs: number;
  lastListedFiles: number;
  lastDomCards: number;
  lastVirtualized: boolean;
  unnecessaryHints: string[];
};

const stats: FileListScrollStats = {
  scrollSessions: 0,
  worstFps: null,
  avgFps: null,
  longTasks: 0,
  worstLongTaskMs: 0,
  lastListedFiles: 0,
  lastDomCards: 0,
  lastVirtualized: false,
  unnecessaryHints: [],
};

let activeSession: ScrollSession | null = null;
let scrollEndTimer: number | null = null;
let longTaskObserver: PerformanceObserver | null = null;
let monitoringEnabled = false;

function emit(label: string, data?: Record<string, unknown>): void {
  devDebug("user-trace", `filelist-scroll | ${label}`, {
    ...(data ?? {}),
    fileListScrollPerf: true,
  });
}

function finishScrollSession(): void {
  if (!activeSession) {
    return;
  }
  const elapsedMs = Math.max(1, activeSession.lastFrameAt - activeSession.startedAt);
  const fps = Math.round((activeSession.frames * 1000) / elapsedMs);
  stats.scrollSessions += 1;
  stats.worstFps =
    stats.worstFps == null ? fps : Math.min(stats.worstFps, fps);
  const prevTotal =
    stats.avgFps == null
      ? 0
      : stats.avgFps * (stats.scrollSessions - 1);
  stats.avgFps = Math.round((prevTotal + fps) / stats.scrollSessions);

  const hints: string[] = [];
  if (activeSession.listedFiles >= FILE_LIST_LARGE_DOM_THRESHOLD) {
    hints.push("大列表 DOM 节点数≈文件数，滚动会随列表增大线性变慢");
  }
  if (activeSession.domCards > 80) {
    hints.push("DOM 卡片过多：检查列表渲染开销");
  }
  if (fps < 45) {
    hints.push("滚动帧率偏低：优先减少滚动期重渲染（缩略图批量更新、动画）");
  }
  if (stats.worstLongTaskMs >= LONG_TASK_MS) {
    hints.push(
      `主线程长任务 ≥${LONG_TASK_MS}ms：可能是缩略图 SVG 解析或全量列表重渲染`,
    );
  }
  stats.unnecessaryHints = [...new Set([...stats.unnecessaryHints, ...hints])];

  emit("scroll-session", {
    fps,
    elapsedMs: Math.round(elapsedMs),
    frames: activeSession.frames,
    listedFiles: activeSession.listedFiles,
    domCards: activeSession.domCards,
    virtualized: activeSession.virtualized,
    hints,
    benchmark: {
      targetFps: 60,
      acceptableFps: 45,
      note: "同类文件管理器（Finder/Explorer/Notion）大目录通常虚拟列表 + 延迟缩略图",
    },
  });
  activeSession = null;
}

function ensureLongTaskObserver(): void {
  if (
    longTaskObserver ||
    typeof PerformanceObserver === "undefined" ||
    !monitoringEnabled
  ) {
    return;
  }
  try {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const duration = Math.round(entry.duration);
        if (duration < LONG_TASK_MS) {
          continue;
        }
        stats.longTasks += 1;
        stats.worstLongTaskMs = Math.max(stats.worstLongTaskMs, duration);
        emit("long-task", { durationMs: duration, name: entry.name });
      }
    });
    longTaskObserver.observe({ type: "longtask", buffered: true });
  } catch {
    longTaskObserver = null;
  }
}

function onScrollFrame(): void {
  if (!activeSession) {
    return;
  }
  const now = performance.now();
  activeSession.frames += 1;
  activeSession.lastFrameAt = now;
  if (now - activeSession.startedAt >= FPS_SAMPLE_MS) {
    finishScrollSession();
  }
}

export function recordFileListScrollContext(data: {
  listedFileCount: number;
  domCardCount: number;
  virtualized: boolean;
}): void {
  stats.lastListedFiles = data.listedFileCount;
  stats.lastDomCards = data.domCardCount;
  stats.lastVirtualized = data.virtualized;
}

export function notifyFileListScrollActivity(): void {
  if (!monitoringEnabled) {
    return;
  }
  const now = performance.now();
  if (!activeSession) {
    activeSession = {
      startedAt: now,
      frames: 1,
      lastFrameAt: now,
      minFps: 60,
      listedFiles: stats.lastListedFiles,
      domCards: stats.lastDomCards,
      virtualized: stats.lastVirtualized,
    };
  } else {
    activeSession.lastFrameAt = now;
    activeSession.frames += 1;
    activeSession.listedFiles = stats.lastListedFiles;
    activeSession.domCards = stats.lastDomCards;
    activeSession.virtualized = stats.lastVirtualized;
  }
  if (scrollEndTimer != null) {
    window.clearTimeout(scrollEndTimer);
  }
  scrollEndTimer = window.setTimeout(() => {
    scrollEndTimer = null;
    finishScrollSession();
  }, SCROLL_SUMMARY_IDLE_MS);
  window.requestAnimationFrame(onScrollFrame);
}

export function getFileListScrollSummary(): FileListScrollStats {
  return { ...stats, unnecessaryHints: [...stats.unnecessaryHints] };
}

export function startFileListScrollMonitoring(): void {
  if (typeof window === "undefined" || monitoringEnabled) {
    return;
  }
  monitoringEnabled = isResourceTraceEnabled();
  if (!monitoringEnabled) {
    return;
  }
  ensureLongTaskObserver();
  emit("monitor.start", getFileListScrollSummary());
}

export function refreshFileListScrollMonitoring(): void {
  const next = isResourceTraceEnabled();
  if (next === monitoringEnabled) {
    return;
  }
  monitoringEnabled = next;
  if (monitoringEnabled) {
    startFileListScrollMonitoring();
  } else {
    longTaskObserver?.disconnect();
    longTaskObserver = null;
    activeSession = null;
  }
}

export function attachFileListScrollElement(el: HTMLElement | null): () => void {
  if (!el) {
    return () => {};
  }
  let scrollingClassTimer: number | null = null;
  const onScroll = () => {
    el.classList.add("filelist__body--scrolling");
    if (scrollingClassTimer != null) {
      window.clearTimeout(scrollingClassTimer);
    }
    scrollingClassTimer = window.setTimeout(() => {
      scrollingClassTimer = null;
      el.classList.remove("filelist__body--scrolling");
    }, 150);
    notifyFileListScrollActivity();
  };
  el.addEventListener("scroll", onScroll, { passive: true });
  return () => {
    el.removeEventListener("scroll", onScroll);
    if (scrollingClassTimer != null) {
      window.clearTimeout(scrollingClassTimer);
    }
    el.classList.remove("filelist__body--scrolling");
  };
}
