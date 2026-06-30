/**
 * 列表缩略图链路可观测性（写入 user-trace → desktop-op.log）。
 *
 * 架构（自上而下）：
 * 1. useFileListController — 文件树、可见区 IO、hash 缓存、fetchedThumbs 状态
 * 2. thumbCoverage — 可见 id → thumbFetchAllowIds（无 off-screen prefetch）
 * 3. useThumbnailPipeline — 跳过/排队 GET /thumbnail
 * 4. fetchThumbnailSvgForCard — HTTP + 空 body bust 重试
 * 5. chooseFileCardThumbnail / resolveFileCardThumbDisplay — 本地/已拉取/展示
 *
 * 日志过滤：`[DEBUG] user-trace | thumb` 或 module `thumbPipeline`
 * 启用：Desktop `EDITORHUB_DESKTOP_DEBUG=1` 或 `window.__EDITORHUB_DEBUG__.enable()`
 */

import { createLogger } from "./logger";
import { traceThumb } from "./interactionDebugTrace";

const logPipe = createLogger({ module: "thumbPipeline" });

let pipelineTickSeq = 0;

/** 当前 in-flight GET（id8） */
const inflightFetches = new Map<string, number>();
/** 累计发起次数与最近一次完成时间（用于发现重复拉取） */
const fetchStats = new Map<string, { starts: number; lastStartAt: number; lastEndAt: number }>();

/** 卡片 loading 态节流（避免 render 刷屏） */
const cardLoadingTraceAt = new Map<string, number>();
const CARD_LOADING_TRACE_MS = 8000;

function id8(fileId: string): string {
  return fileId.length <= 8 ? fileId : fileId.slice(0, 8);
}

function summarizeIds(ids: readonly string[], limit = 12): string[] {
  return ids.slice(0, limit).map((id) => id8(id));
}

export function nextThumbPipelineTick(): number {
  pipelineTickSeq += 1;
  return pipelineTickSeq;
}

export function traceThumbPipelineTick(data: {
  tick: number;
  scopeN: number;
  allowN: number;
  fetchedN: number;
  inFlightN: number;
  toFetchN: number;
  toFetchIds8: string[];
  skipped: Record<string, number>;
}): void {
  const payload = {
    tick: data.tick,
    scopeN: data.scopeN,
    allowN: data.allowN,
    fetchedN: data.fetchedN,
    inFlightN: data.inFlightN,
    toFetchN: data.toFetchN,
    toFetchIds8: data.toFetchIds8,
    skipped: data.skipped,
  };
  traceThumb("pipeline.tick", payload, "ok");
  if (data.toFetchN > 0 || data.inFlightN > 0) {
    logPipe.info("pipeline tick", payload);
  }
}

export function traceThumbFetchAllowChange(data: {
  visibleN: number;
  allowN: number;
  scopeN: number;
  addedVisible8: string[];
  removedVisible8: string[];
  allowDelta: number;
}): void {
  traceThumb("coverage.allowChange", data, "ok");
  logPipe.info("thumb allow set changed", data);
}

export function traceThumbHashInvalidate(data: {
  clearedIds8: string[];
  reasons: Array<{ id8: string; oldHash: string | null; newHash: string | null; reason: string }>;
  filesN: number;
}): void {
  if (data.clearedIds8.length === 0) {
    return;
  }
  traceThumb("cache.hashInvalidate", data, "ok");
  logPipe.info("fetched thumbs cleared", {
    count: data.clearedIds8.length,
    ids8: data.clearedIds8.slice(0, 16),
    reasons: data.reasons.slice(0, 8),
    filesN: data.filesN,
  });
}

export function traceThumbFetchStart(data: {
  fileId: string;
  tick: number;
  cacheKey: string | null;
  contentSha8: string | null;
  alreadyInflight: boolean;
}): void {
  const fileId8 = id8(data.fileId);
  const stats = fetchStats.get(fileId8) ?? {
    starts: 0,
    lastStartAt: 0,
    lastEndAt: 0,
  };
  const now = Date.now();
  const rapidRepeat =
    stats.lastEndAt > 0 && now - stats.lastEndAt < 3000;
  const burstRepeat =
    stats.lastStartAt > 0 && now - stats.lastStartAt < 500;
  stats.starts += 1;
  stats.lastStartAt = now;
  fetchStats.set(fileId8, stats);
  inflightFetches.set(fileId8, data.tick);

  const payload = {
    fileId8,
    tick: data.tick,
    cacheKey8: data.cacheKey?.slice(0, 8) ?? null,
    contentSha8: data.contentSha8,
    alreadyInflight: data.alreadyInflight,
    rapidRepeat,
    burstRepeat,
    totalStarts: stats.starts,
    inflightN: inflightFetches.size,
  };
  traceThumb("fetch.start", payload, rapidRepeat || burstRepeat ? "branch" : "start");
  if (data.alreadyInflight || rapidRepeat || burstRepeat) {
    logPipe.warn("duplicate or rapid thumb fetch", payload);
  }
}

export function traceThumbFetchHttp(data: {
  fileId8: string;
  step: "A" | "B";
  ms: number;
  status: number;
  bodyLen: number;
  bodyEmpty: boolean;
  bustRetry: boolean;
}): void {
  traceThumb("fetch.http", data, data.bodyEmpty ? "branch" : "ok");
  if (data.bustRetry || data.bodyEmpty || data.status >= 400) {
    logPipe.info("thumb GET response", data);
  }
}

export function traceThumbFetchEnd(data: {
  fileId: string;
  tick: number;
  outcome:
    | "apply"
    | "empty"
    | "fail"
    | "stale"
    | "unmounted"
    | "error";
  ms: number;
  svgLen?: number;
  status?: number;
  detail?: Record<string, unknown>;
}): void {
  const fileId8 = id8(data.fileId);
  inflightFetches.delete(fileId8);
  const stats = fetchStats.get(fileId8);
  if (stats) {
    stats.lastEndAt = Date.now();
  }

  const payload = {
    fileId8,
    tick: data.tick,
    outcome: data.outcome,
    ms: Math.round(data.ms),
    svgLen: data.svgLen ?? 0,
    status: data.status ?? null,
    inflightN: inflightFetches.size,
    totalStarts: stats?.starts ?? null,
    ...(data.detail ?? {}),
  };
  const phase =
    data.outcome === "apply"
      ? "ok"
      : data.outcome === "stale" || data.outcome === "empty"
        ? "skip"
        : data.outcome === "fail" || data.outcome === "error"
          ? "fail"
          : "ok";
  traceThumb("fetch.end", payload, phase);
  if (data.outcome !== "apply") {
    logPipe.info("thumb fetch finished", payload);
  }
}

export function traceThumbFetchedStateApply(data: {
  addedIds8: string[];
  removedIds8: string[];
  prevN: number;
  nextN: number;
  source: string;
}): void {
  if (data.addedIds8.length === 0 && data.removedIds8.length === 0) {
    return;
  }
  traceThumb("state.fetchedApply", data, "ok");
  logPipe.info("fetchedThumbs state", data);
}

export function traceThumbChoiceReject(data: {
  fileId8: string;
  reason: string;
  fetchedLen: number;
  fetchedHash8: string | null;
  fileHash8: string | null;
}): void {
  traceThumb("choice.reject", data, "skip");
  logPipe.info("thumb choice rejected fetched", data);
}

/** 仍在 loading 且服务端标记有缩略图时节流上报（排查「一直转圈」） */
export function traceThumbCardLoadingStuck(data: {
  fileId: string;
  kind?: string | null;
  contentSha8: string | null;
  fetchedLen: number;
  fetchedHash8: string | null;
  reasons: string[];
}): void {
  const fileId8 = id8(data.fileId);
  const now = Date.now();
  const last = cardLoadingTraceAt.get(fileId8) ?? 0;
  if (now - last < CARD_LOADING_TRACE_MS) {
    return;
  }
  cardLoadingTraceAt.set(fileId8, now);
  traceThumb("card.loadingStuck", { ...data, fileId8 }, "branch");
  logPipe.warn("card thumb still loading", { ...data, fileId8 });
}

/** 调试汇总：控制台 `window.__EDITORHUB_DEBUG__.thumbPipelineSummary()` */
export function getThumbPipelineTraceSummary(): Record<string, unknown> {
  const topRepeat = [...fetchStats.entries()]
    .sort((a, b) => b[1].starts - a[1].starts)
    .slice(0, 20)
    .map(([fileId8, s]) => ({ fileId8, starts: s.starts }));
  return {
    pipelineTickSeq,
    inflightN: inflightFetches.size,
    inflightIds8: [...inflightFetches.keys()],
    fetchStatsTop: topRepeat,
    cardLoadingTracedN: cardLoadingTraceAt.size,
  };
}
