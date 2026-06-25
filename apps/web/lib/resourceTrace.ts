/**
 * 资源占用与重复调用追踪：API 频次、耗时、短间隔重复、内存快照、重状态更新。
 *
 * 启用：
 * - Desktop：`EDITORHUB_DESKTOP_DEBUG=1` 或 `window.__EDITORHUB_DEBUG__.enable()`
 * - 控制台：`localStorage.setItem('excalidraw-resource-trace', '1')` 后刷新
 * - 查看汇总：`window.__EDITORHUB_DEBUG__.resourceSummary()`
 */

import { isDebugLoggingEnabled, subscribeAppSettings } from "../data/appSettings";

const STORAGE_KEY = "excalidraw-resource-trace";
const RAPID_WINDOW_MS = 2000;
const RAPID_WARN_THRESHOLD = 3;
const SNAPSHOT_INTERVAL_MS = 30_000;

type OpStats = {
  count: number;
  ok: number;
  fail: number;
  totalMs: number;
  lastMs: number;
  lastAt: number;
  rapidHits: number;
};

type AreaStats = {
  start: number;
  ok: number;
  skip: number;
  fail: number;
  lastAt: number;
};

const apiStats = new Map<string, OpStats>();
const areaStats = new Map<string, AreaStats>();
let sessionStartMs = Date.now();
let snapshotTimer: number | null = null;
let catalogChangeCount = 0;
let silentRefreshScheduled = 0;
let treeStateApplies = 0;

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function isResourceTraceEnabled(): boolean {
  if (isDebugLoggingEnabled()) {
    return true;
  }
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function emit(label: string, data?: Record<string, unknown>): void {
  const payload = { ...(data ?? {}), resourceTrace: true };
  const prefix = `[DEBUG] user-trace | resource | ${label}`;
  try {
    console.warn(prefix, payload);
  } catch {
    console.warn(prefix);
  }
}

function normalizeApiKey(method: string, path: string): string {
  const raw = path.trim().replace(/^\/api\//, "");
  const base = raw.split("?")[0];
  return `${method.toUpperCase()} ${base}`;
}

function getMemorySnapshot(): Record<string, number> | null {
  if (typeof performance === "undefined") {
    return null;
  }
  const perf = performance as Performance & {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  };
  if (!perf.memory) {
    return null;
  }
  return {
    usedMB: Math.round(perf.memory.usedJSHeapSize / 1048576),
    totalMB: Math.round(perf.memory.totalJSHeapSize / 1048576),
    limitMB: Math.round(perf.memory.jsHeapSizeLimit / 1048576),
  };
}

export function traceApiCall(
  method: string,
  path: string,
  status: number,
  durationMs: number,
  meta?: Record<string, unknown>,
): void {
  if (!isResourceTraceEnabled()) {
    return;
  }
  const key = normalizeApiKey(method, path);
  const wall = Date.now();
  let stats = apiStats.get(key);
  if (!stats) {
    stats = {
      count: 0,
      ok: 0,
      fail: 0,
      totalMs: 0,
      lastMs: 0,
      lastAt: 0,
      rapidHits: 0,
    };
    apiStats.set(key, stats);
  }
  stats.count += 1;
  stats.totalMs += durationMs;
  stats.lastMs = durationMs;
  if (status >= 200 && status < 300 || status === 304) {
    stats.ok += 1;
  } else if (status >= 400) {
    stats.fail += 1;
  }
  if (stats.lastAt > 0 && wall - stats.lastAt < RAPID_WINDOW_MS) {
    stats.rapidHits += 1;
    if (stats.rapidHits === RAPID_WARN_THRESHOLD) {
      emit("api.rapid-duplicate", {
        key,
        gapMs: wall - stats.lastAt,
        status,
        durationMs,
        count: stats.count,
        hint: "短间隔内重复请求，可能存在冗余刷新",
        ...(meta ?? {}),
      });
    }
  } else if (stats.lastAt > 0) {
    stats.rapidHits = 0;
  }
  stats.lastAt = wall;

  const slow = durationMs >= 400;
  const notable = slow || status === 304 || key.includes("/files/tree");
  if (notable) {
    emit("api", {
      key,
      status,
      durationMs,
      ...(meta ?? {}),
    });
  }
}

export function traceResourceOp(
  area: string,
  action: string,
  phase: "start" | "ok" | "skip" | "fail",
  data?: Record<string, unknown>,
): void {
  if (!isResourceTraceEnabled()) {
    return;
  }
  const key = `${area}.${action}`;
  let stats = areaStats.get(key);
  if (!stats) {
    stats = { start: 0, ok: 0, skip: 0, fail: 0, lastAt: 0 };
    areaStats.set(key, stats);
  }
  stats.lastAt = Date.now();
  if (phase === "start") {
    stats.start += 1;
  } else if (phase === "ok") {
    stats.ok += 1;
  } else if (phase === "skip") {
    stats.skip += 1;
  } else {
    stats.fail += 1;
    emit(`${area} | ${action} | ${phase}`, data);
  }
}

export function traceCatalogChangeScheduled(): void {
  if (!isResourceTraceEnabled()) {
    return;
  }
  catalogChangeCount += 1;
  silentRefreshScheduled += 1;
  if (catalogChangeCount % 5 === 0) {
    emit("catalog-change.burst", {
      catalogChangeCount,
      silentRefreshScheduled,
      hint: "目录变更事件频繁，检查是否重复触发 refresh",
    });
  }
}

export function traceTreeStateApply(data: Record<string, unknown>): void {
  if (!isResourceTraceEnabled()) {
    return;
  }
  treeStateApplies += 1;
  if (treeStateApplies % 10 === 0) {
    emit("filelist.tree-state-apply", {
      treeStateApplies,
      ...data,
    });
  }
}

export function getResourceTraceSummary(): Record<string, unknown> {
  const topApis = [...apiStats.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([key, s]) => ({
      key,
      count: s.count,
      ok: s.ok,
      fail: s.fail,
      rapidHits: s.rapidHits,
      avgMs: s.count ? Math.round(s.totalMs / s.count) : 0,
      lastMs: s.lastMs,
    }));
  const redundantApis = topApis.filter((row) => row.rapidHits >= RAPID_WARN_THRESHOLD);
  const areas = [...areaStats.entries()]
    .sort((a, b) => b[1].start - a[1].start)
    .slice(0, 20)
    .map(([key, s]) => ({
      key,
      start: s.start,
      ok: s.ok,
      skip: s.skip,
      fail: s.fail,
    }));
  return {
    sessionSec: Math.round((Date.now() - sessionStartMs) / 1000),
    memory: getMemorySnapshot(),
    catalogChangeCount,
    silentRefreshScheduled,
    treeStateApplies,
    topApis,
    redundantApis,
    areas,
  };
}

export function startResourceTraceSnapshots(): void {
  if (!isResourceTraceEnabled() || snapshotTimer !== null) {
    return;
  }
  if (typeof window === "undefined") {
    return;
  }
  snapshotTimer = window.setInterval(() => {
    emit("snapshot", getResourceTraceSummary());
  }, SNAPSHOT_INTERVAL_MS);
  emit("snapshot.start", { intervalMs: SNAPSHOT_INTERVAL_MS });
}

export function stopResourceTraceSnapshots(): void {
  if (snapshotTimer !== null) {
    window.clearInterval(snapshotTimer);
    snapshotTimer = null;
  }
}

export function enableResourceTracePersistence(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
  startResourceTraceSnapshots();
}

export function mergeResourceTraceGlobals(
  globals: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...globals,
    resourceSummary: () => {
      const summary = getResourceTraceSummary();
      console.info("[resource-trace] summary", summary);
      if (summary.topApis && Array.isArray(summary.topApis)) {
        console.table(summary.topApis);
      }
      if (summary.redundantApis && Array.isArray(summary.redundantApis) && summary.redundantApis.length > 0) {
        console.warn("[resource-trace] 疑似冗余高频 API:", summary.redundantApis);
      }
      return summary;
    },
    enableResourceTrace: () => {
      enableResourceTracePersistence();
      console.warn("[resource-trace] enabled — reload recommended for full hooks");
    },
  };
}

export function bootResourceTrace(): void {
  const startIfEnabled = (): void => {
    if (!isResourceTraceEnabled()) {
      return;
    }
    if (snapshotTimer !== null) {
      return;
    }
    sessionStartMs = Date.now();
    startResourceTraceSnapshots();
    emit("boot", getMemorySnapshot() ?? {});
  };
  startIfEnabled();
  if (typeof window !== "undefined") {
    subscribeAppSettings(() => startIfEnabled());
  }
}
