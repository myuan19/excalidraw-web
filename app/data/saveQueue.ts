/**
 * 统一保存队列（生产-消费模式）
 *
 * 所有保存触发源（visibility、auto、hotkey、toolbar、sidebar、home）
 * 统一调用 `requestSave()` 投递保存事件。队列负责：
 *
 * 1. **合并**：短时间内（COALESCE_MS）多次触发只执行一次保存
 * 2. **串行**：上一次保存完成前不启动下一次，避免并发竞争
 * 3. **优先级**：合并时保留优先级最高的 source（用户主动 > 自动）
 * 4. **幂等**：同一 requestId 的重复投递只执行一次
 * 5. **后处理**：保存成功后统一执行 broadcastFileSaved
 *
 * 编辑器只需在初始化时 `installExecutor(fn)` 注册实际保存函数，
 * 各触发点改为 `requestSave({ source })` 即可。
 */

import { createLogger } from "../lib/logger";

import { getAppSettings, isIdleAutoSaveActive } from "./appSettings";
import { broadcastFileSaved } from "./crossTabFileSync";
import { getClientTabId } from "./clientRequestContext";
import { shouldBlockPassiveSave } from "./fileSyncOperationState";
import { logPerf } from "../lib/perfLog";

import type { SaveToServerSource } from "../hooks/types";

const log = createLogger({ module: "saveQueue" });

const COALESCE_MS = 300;

const SOURCE_PRIORITY: Record<SaveToServerSource, number> = {
  toolbar: 10,
  hotkey: 10,
  sidebar: 10,
  home: 9,
  visibility: 5,
  auto: 1,
  thumbnail: 0,
};

function higherPrioritySource(
  a: SaveToServerSource,
  b: SaveToServerSource,
): SaveToServerSource {
  return (SOURCE_PRIORITY[a] ?? 0) >= (SOURCE_PRIORITY[b] ?? 0) ? a : b;
}

export interface SaveRequest {
  source: SaveToServerSource;
  navigateAfter?: boolean;
  forceThumbnail?: boolean;
  /**
   * Active requests must not assume an already-running passive save is enough.
   * When queued behind an in-flight save, re-check the latest dirty state before
   * deciding whether to run a fresh snapshot save.
   */
  requiresFreshSnapshot?: boolean;
  /** 同一次 UI 命令的幂等 key，避免重复事件创建重复 checkpoint。 */
  requestId?: string;
}

export interface SaveResult {
  saved: boolean;
  /** 服务器内容去重命中（内容没变），不广播跨页刷新 */
  skipped?: boolean;
  fileId?: string;
  /** 服务器返回的 content_sha256，随广播下发 */
  contentSha256?: string | null;
  /** 服务器返回的整数版本，随广播下发用于接收端绑定提示目标 */
  version?: number | null;
  /** 队列级 follow-up 发现当前文件已干净，未再调用 executor。 */
  clean?: boolean;
}

type SaveExecutor = (req: SaveRequest) => Promise<SaveResult>;
type CurrentFileIdGetter = () => string | null | undefined;
type CurrentFileDirtyGetter = (req: SaveRequest) => boolean;
type QueuedSaveRequest = SaveRequest & { queuedWhileRunning?: boolean };

let executor: SaveExecutor | null = null;
let getCurrentFileId: CurrentFileIdGetter | null = null;
let getCurrentFileDirty: CurrentFileDirtyGetter | null = null;
let pending: QueuedSaveRequest | null = null;
let pendingResolvers: Array<(r: SaveResult) => void> = [];
let coalesceTimer: number | null = null;
let running = false;
let runningPromise: Promise<SaveResult> | null = null;
let runningRequestId: string | null = null;
let queueSeq = 0;

function fileId8(fileId: string | null | undefined): string | null {
  return fileId ? fileId.slice(0, 8) : null;
}

function requestMeta(req: SaveRequest, extra?: Record<string, unknown>) {
  const currentFileId = getCurrentFileId?.() ?? null;
  return {
    clientTabId: getClientTabId(),
    source: req.source,
    requestId: req.requestId ?? null,
    fileId8: fileId8(currentFileId),
    navigateAfter: !!req.navigateAfter,
    forceThumbnail: !!req.forceThumbnail,
    requiresFreshSnapshot: !!req.requiresFreshSnapshot,
    pendingSource: pending?.source ?? null,
    pendingQueuedWhileRunning: !!pending?.queuedWhileRunning,
    running,
    runningRequestId,
    ...extra,
  };
}

function logSaveQueue(
  level: "info" | "warn" | "debug",
  event: string,
  message: string,
  fields?: Record<string, unknown>,
): void {
  log.event(level, `save.queue.${event}`, message, { fields });
}

function logSaveQueuePerf(
  event: string,
  req: SaveRequest,
  fields?: Record<string, unknown>,
): void {
  logPerf(`save.queue.${event}`, requestMeta(req, fields));
}

function isActiveSaveSource(source: SaveToServerSource): boolean {
  return (SOURCE_PRIORITY[source] ?? 0) >= SOURCE_PRIORITY.home;
}

function normalizeRequest(req: SaveRequest): QueuedSaveRequest {
  return {
    ...req,
    requiresFreshSnapshot:
      req.requiresFreshSnapshot ?? isActiveSaveSource(req.source),
  };
}

function clearCoalesceTimer() {
  if (coalesceTimer != null) {
    window.clearTimeout(coalesceTimer);
    coalesceTimer = null;
  }
}

function mergeRequest(
  existing: QueuedSaveRequest,
  incoming: QueuedSaveRequest,
): QueuedSaveRequest {
  return {
    source: higherPrioritySource(existing.source, incoming.source),
    navigateAfter: existing.navigateAfter || incoming.navigateAfter,
    forceThumbnail: existing.forceThumbnail || incoming.forceThumbnail,
    requiresFreshSnapshot:
      existing.requiresFreshSnapshot || incoming.requiresFreshSnapshot,
    requestId:
      existing.requestId === incoming.requestId
        ? existing.requestId
        : incoming.requestId ?? existing.requestId,
    queuedWhileRunning:
      existing.queuedWhileRunning || incoming.queuedWhileRunning,
  };
}

const NO_SAVE: SaveResult = { saved: false };
const CLEAN_NO_SAVE: SaveResult = { saved: false, clean: true };
const COMPLETED_REQUEST_TTL_MS = 2_000;

const completedRequests = new Map<
  string,
  { result: SaveResult; completedAt: number }
>();

function pruneCompletedRequests(now = Date.now()): void {
  for (const [requestId, entry] of completedRequests) {
    if (now - entry.completedAt > COMPLETED_REQUEST_TTL_MS) {
      completedRequests.delete(requestId);
    }
  }
}

function getCompletedRequestResult(
  requestId: string | undefined,
): SaveResult | null {
  if (!requestId) {
    return null;
  }
  pruneCompletedRequests();
  return completedRequests.get(requestId)?.result ?? null;
}

function rememberCompletedRequest(
  requestId: string | null,
  result: SaveResult,
): void {
  if (!requestId) {
    return;
  }
  pruneCompletedRequests();
  completedRequests.set(requestId, {
    result,
    completedAt: Date.now(),
  });
}

function hasSameRequestId(
  requestId: string | undefined,
  activeRequestId: string | null | undefined,
): boolean {
  return !!requestId && requestId === activeRequestId;
}

function shouldIgnoreSaveRequest(req: SaveRequest): boolean {
  const currentFileId = getCurrentFileId?.() ?? null;
  if (shouldBlockPassiveSave(currentFileId, req.source)) {
    logSaveQueue(
      "info",
      "request.ignored_policy",
      "request ignored by policy",
      requestMeta(req, {
        reason: "remote-operation-active",
        fileId8: fileId8(currentFileId),
      }),
    );
    return true;
  }
  if (req.source === "visibility") {
    logSaveQueue(
      "info",
      "request.ignored_policy",
      "request ignored by policy",
      requestMeta(req, { reason: "visibility" }),
    );
    return true;
  }
  if (req.source === "auto") {
    const ignored = !isIdleAutoSaveActive();
    if (ignored) {
      logSaveQueue(
        "info",
        "request.ignored_policy",
        "request ignored by policy",
        requestMeta(req, { reason: "auto-disabled" }),
      );
    }
    return ignored;
  }
  const ignored =
    req.source === "thumbnail" && !getAppSettings().autoSaveEnabled;
  if (ignored) {
    logSaveQueue(
      "info",
      "request.ignored_policy",
      "request ignored by policy",
      requestMeta(req, { reason: "thumbnail-disabled" }),
    );
  }
  return ignored;
}

async function drain(): Promise<SaveResult> {
  if (!pending || !executor) {
    return NO_SAVE;
  }
  if (running) {
    return runningPromise ?? Promise.resolve(NO_SAVE);
  }
  const req = pending;
  const resolvers = pendingResolvers;
  const queueId = ++queueSeq;
  pending = null;
  pendingResolvers = [];

  if (shouldIgnoreSaveRequest(req)) {
    for (const resolve of resolvers) {
      resolve(NO_SAVE);
    }
    if (pending) {
      void drain();
    }
    return NO_SAVE;
  }

  if (
    req.queuedWhileRunning &&
    req.requiresFreshSnapshot &&
    !req.forceThumbnail &&
    getCurrentFileDirty &&
    !getCurrentFileDirty(req)
  ) {
    logSaveQueue(
      "info",
      "followup.skipped_clean",
      "follow-up skipped because latest state is clean",
      requestMeta(req, { queueId, resolverCount: resolvers.length }),
    );
    logSaveQueuePerf("followup_skipped_clean", req, {
      queueId,
      resolverCount: resolvers.length,
    });
    rememberCompletedRequest(req.requestId ?? null, CLEAN_NO_SAVE);
    for (const resolve of resolvers) {
      resolve(CLEAN_NO_SAVE);
    }
    if (pending) {
      void drain();
    }
    return CLEAN_NO_SAVE;
  }

  if (req.queuedWhileRunning && req.requiresFreshSnapshot) {
    logSaveQueue(
      "info",
      "followup.executed_dirty",
      "follow-up executing because latest state changed",
      requestMeta(req, { queueId, resolverCount: resolvers.length }),
    );
    logSaveQueuePerf("followup_executed_dirty", req, {
      queueId,
      resolverCount: resolvers.length,
    });
  }

  running = true;
  runningRequestId = req.requestId ?? null;

  let result: SaveResult = NO_SAVE;
  const p = (async () => {
    try {
      logSaveQueue(
        "info",
        "save.start",
        "save start",
        requestMeta(req, { queueId, resolverCount: resolvers.length }),
      );
      result = await executor!(req);
      logSaveQueue(
        "info",
        "save.done",
        "save done",
        requestMeta(req, {
          queueId,
          saved: result.saved,
          skipped: !!result.skipped,
          fileId8: fileId8(result.fileId),
          contentSha8: result.contentSha256?.slice(0, 8) ?? null,
        }),
      );

      if (result.saved && result.fileId && !result.skipped) {
        logSaveQueue("info", "broadcast.file_saved", "broadcast file-saved", {
          clientTabId: getClientTabId(),
          queueId,
          source: req.source,
          fileId8: result.fileId.slice(0, 8),
          sha8: result.contentSha256?.slice(0, 8) ?? null,
          version: result.version ?? null,
        });
        broadcastFileSaved(result.fileId, {
          contentSha256: result.contentSha256,
          version: result.version,
        });
      }
    } catch (e) {
      logSaveQueue(
        "warn",
        "save.failed",
        "save failed",
        requestMeta(req, {
          queueId,
          message: e instanceof Error ? e.message : String(e),
        }),
      );
    } finally {
      rememberCompletedRequest(runningRequestId, result);
      running = false;
      runningPromise = null;
      runningRequestId = null;
      for (const resolve of resolvers) {
        resolve(result);
      }
    }

    if (pending) {
      void drain();
    }
    return result;
  })();

  runningPromise = p;
  return p;
}

function scheduleFlush(immediate: boolean) {
  clearCoalesceTimer();
  if (immediate) {
    void drain();
    return;
  }
  coalesceTimer = window.setTimeout(() => {
    coalesceTimer = null;
    void drain();
  }, COALESCE_MS);
}

/**
 * 投递一个保存请求（fire-and-forget）。
 *
 * - 用户主动保存（toolbar/hotkey/sidebar/home）立即执行
 * - 被动保存（visibility/auto）经过 COALESCE_MS 合并窗口
 * - 如果已有 pending 请求，合并为一个（保留高优先级 source）
 * - 如果当前有保存正在执行，排队等待
 */
export function requestSave(req: SaveRequest): void {
  const normalizedReq = normalizeRequest(req);
  if (!executor) {
    logSaveQueue(
      "info",
      "request.ignored_no_executor",
      "requestSave ignored: no executor installed",
      requestMeta(normalizedReq),
    );
    return;
  }

  if (shouldIgnoreSaveRequest(normalizedReq)) {
    return;
  }

  if (getCompletedRequestResult(normalizedReq.requestId)) {
    logSaveQueue(
      "info",
      "request.ignored_duplicate_completed",
      "requestSave ignored: duplicate completed request",
      requestMeta(normalizedReq),
    );
    return;
  }

  if (hasSameRequestId(normalizedReq.requestId, runningRequestId)) {
    logSaveQueue(
      "info",
      "request.ignored_duplicate_running",
      "requestSave ignored: duplicate running request",
      requestMeta(normalizedReq),
    );
    return;
  }

  if (pending) {
    const before = pending;
    pending = mergeRequest(pending, {
      ...normalizedReq,
      queuedWhileRunning: running,
    });
    logSaveQueue(
      "info",
      "request.merged",
      "requestSave merged",
      requestMeta(normalizedReq, {
        previousPendingSource: before.source,
        mergedSource: pending.source,
        previousPendingRequestId: before.requestId ?? null,
        mergedRequestId: pending.requestId ?? null,
        mergedRequiresFreshSnapshot: !!pending.requiresFreshSnapshot,
        queuedWhileRunning: running,
      }),
    );
  } else {
    pending = { ...normalizedReq, queuedWhileRunning: running };
    logSaveQueue(
      "info",
      "request.queued",
      "requestSave queued",
      requestMeta(normalizedReq),
    );
  }

  if (running) {
    logSaveQueue(
      "info",
      "followup.queued",
      "requestSave queued follow-up while running",
      requestMeta(normalizedReq, {
        pendingSource: pending.source,
        pendingRequestId: pending.requestId ?? null,
        pendingRequiresFreshSnapshot: !!pending.requiresFreshSnapshot,
      }),
    );
    logSaveQueuePerf("followup_queued", normalizedReq, {
      pendingSource: pending.source,
      pendingRequestId: pending.requestId ?? null,
      pendingRequiresFreshSnapshot: !!pending.requiresFreshSnapshot,
    });
  }

  const isUserAction = isActiveSaveSource(normalizedReq.source);
  logSaveQueue(
    "info",
    "request.schedule",
    "requestSave schedule",
    requestMeta(normalizedReq, { immediate: isUserAction }),
  );
  scheduleFlush(isUserAction);
}

/**
 * 投递一个保存请求并等待完成（用于需要等结果的场景，如 home 导航）。
 * 如果已有 pending 请求，合并后共享同一次保存的结果。
 * 如果当前有保存在执行，等待其完成后再执行合并后的新请求。
 */
export function requestSaveAndWait(req: SaveRequest): Promise<SaveResult> {
  const normalizedReq = normalizeRequest(req);
  if (!executor) {
    logSaveQueue(
      "info",
      "request_wait.ignored_no_executor",
      "requestSaveAndWait ignored: no executor installed",
      requestMeta(normalizedReq),
    );
    return Promise.resolve(NO_SAVE);
  }

  if (shouldIgnoreSaveRequest(normalizedReq)) {
    return Promise.resolve(NO_SAVE);
  }

  const completed = getCompletedRequestResult(normalizedReq.requestId);
  if (completed) {
    logSaveQueue(
      "info",
      "request_wait.reused_completed",
      "requestSaveAndWait reused completed request",
      requestMeta(normalizedReq),
    );
    return Promise.resolve(completed);
  }

  if (hasSameRequestId(normalizedReq.requestId, runningRequestId)) {
    logSaveQueue(
      "info",
      "request_wait.joined_running",
      "requestSaveAndWait joined running request",
      requestMeta(normalizedReq),
    );
    logSaveQueuePerf("joined_running", normalizedReq);
    return runningPromise ?? Promise.resolve(NO_SAVE);
  }

  if (pending) {
    const before = pending;
    pending = mergeRequest(pending, {
      ...normalizedReq,
      queuedWhileRunning: running,
    });
    logSaveQueue(
      "info",
      "request_wait.merged",
      "requestSaveAndWait merged",
      requestMeta(normalizedReq, {
        previousPendingSource: before.source,
        mergedSource: pending.source,
        previousPendingRequestId: before.requestId ?? null,
        mergedRequestId: pending.requestId ?? null,
        mergedRequiresFreshSnapshot: !!pending.requiresFreshSnapshot,
        queuedWhileRunning: running,
      }),
    );
  } else {
    pending = { ...normalizedReq, queuedWhileRunning: running };
    logSaveQueue(
      "info",
      "request_wait.queued",
      "requestSaveAndWait queued",
      requestMeta(normalizedReq),
    );
  }

  clearCoalesceTimer();

  if (running) {
    logSaveQueue(
      "info",
      "request_wait.waits_running",
      "requestSaveAndWait waits running save",
      requestMeta(normalizedReq),
    );
    logSaveQueue(
      "info",
      "followup.queued",
      "requestSaveAndWait queued follow-up while running",
      requestMeta(normalizedReq, {
        pendingSource: pending.source,
        pendingRequestId: pending.requestId ?? null,
        pendingRequiresFreshSnapshot: !!pending.requiresFreshSnapshot,
      }),
    );
    logSaveQueuePerf("followup_queued", normalizedReq, {
      pendingSource: pending.source,
      pendingRequestId: pending.requestId ?? null,
      pendingRequiresFreshSnapshot: !!pending.requiresFreshSnapshot,
    });
    return new Promise<SaveResult>((resolve) => {
      pendingResolvers.push(resolve);
    });
  }

  return drain();
}

/**
 * 注册实际执行保存的函数。
 * 每个编辑器在挂载时调用一次。返回卸载函数。
 *
 * executor 负责：
 * - 获取当前文档数据
 * - 调用 ServerSync.saveFileImmediate
 * - 更新 FileSyncState / hash / localCache
 * - 设置 UI 提示（toast / hint）
 * - 返回 { saved, skipped, fileId }
 *
 * executor 不需要处理：broadcastFileSaved（队列统一做）
 */
export function installExecutor(
  fn: SaveExecutor,
  opts?: {
    getCurrentFileId?: CurrentFileIdGetter;
    getCurrentFileDirty?: CurrentFileDirtyGetter;
  },
): () => void {
  logSaveQueue("info", "executor.installed", "executor installed", {
    clientTabId: getClientTabId(),
  });
  executor = fn;
  getCurrentFileId = opts?.getCurrentFileId ?? null;
  getCurrentFileDirty = opts?.getCurrentFileDirty ?? null;
  completedRequests.clear();
  return () => {
    if (executor === fn) {
      logSaveQueue("info", "executor.uninstalled", "executor uninstalled", {
        clientTabId: getClientTabId(),
      });
      executor = null;
      getCurrentFileId = null;
      getCurrentFileDirty = null;
    }
    clearCoalesceTimer();
    pending = null;
    pendingResolvers = [];
  };
}

/** 当前是否有保存正在执行 */
export function isSaveInFlight(): boolean {
  return running;
}
