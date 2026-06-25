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
 * 5. **保存状态**：队列只负责调度和幂等，服务器成功后的事件由 ServerSync 统一发出
 *
 * 编辑器只需在初始化时 `installExecutor(fn)` 注册实际保存函数，
 * 各触发点改为 `requestSave({ source })` 即可。
 */

import { createLogger } from "../lib/logger";
import { traceSaveFlow, id8 } from "../lib/interactionDebugTrace";
import { traceResourceOp } from "../lib/resourceTrace";
import { traceUserAction } from "../lib/userTrace";

import { getAppSettings, isIdleAutoSaveActive } from "./appSettings";
import { shouldBlockPassiveSave } from "./fileSyncOperationState";
import {
  clearThumbnailSavePending,
  isThumbnailSavePending,
  markThumbnailSavePending,
} from "./thumbnailSavePending";

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
  /** 服务器返回的 document version，随广播下发 */
  version?: number | null;
}

type SaveExecutor = (req: SaveRequest) => Promise<SaveResult>;
type CurrentFileIdGetter = () => string | null | undefined;

let executor: SaveExecutor | null = null;
let getCurrentFileId: CurrentFileIdGetter | null = null;
let pending: SaveRequest | null = null;
let pendingResolvers: Array<(r: SaveResult) => void> = [];
let coalesceTimer: number | null = null;
let running = false;
let runningPromise: Promise<SaveResult> | null = null;
let runningRequestId: string | null = null;

function clearCoalesceTimer() {
  if (coalesceTimer != null) {
    window.clearTimeout(coalesceTimer);
    coalesceTimer = null;
  }
}

function mergeRequest(
  existing: SaveRequest,
  incoming: SaveRequest,
): SaveRequest {
  return {
    source: higherPrioritySource(existing.source, incoming.source),
    navigateAfter: existing.navigateAfter || incoming.navigateAfter,
    forceThumbnail: existing.forceThumbnail || incoming.forceThumbnail,
    requestId:
      existing.requestId === incoming.requestId
        ? existing.requestId
        : incoming.requestId ?? existing.requestId,
  };
}

const NO_SAVE: SaveResult = { saved: false };
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
    return true;
  }
  if (req.source === "visibility") {
    return true;
  }
  if (req.source === "auto") {
    return !isIdleAutoSaveActive();
  }
  return req.source === "thumbnail" && !getAppSettings().autoSaveEnabled;
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
  pending = null;
  pendingResolvers = [];

  if (shouldIgnoreSaveRequest(req)) {
    traceUserAction(
      "saveQueue",
      "drain",
      {
        source: req.source,
        reason: "ignored-source",
      },
      "skip",
    );
    for (const resolve of resolvers) {
      resolve(NO_SAVE);
    }
    if (pending) {
      void drain();
    }
    return NO_SAVE;
  }

  running = true;
  runningRequestId = req.requestId ?? null;
  const savingFileId = getCurrentFileId?.() ?? null;
  if (savingFileId) {
    markThumbnailSavePending([savingFileId]);
  }

  let result: SaveResult = NO_SAVE;
  const p = (async () => {
    try {
      traceUserAction(
        "saveQueue",
        "drain",
        {
          source: req.source,
          requestId: req.requestId ?? null,
          navigateAfter: !!req.navigateAfter,
          forceThumbnail: !!req.forceThumbnail,
        },
        "start",
      );
      traceSaveFlow("drain", {
        source: req.source,
        fileId8: savingFileId?.slice(0, 8) ?? null,
        requestId: req.requestId ?? null,
        navigateAfter: !!req.navigateAfter,
        thumbSavePending: savingFileId
          ? isThumbnailSavePending(savingFileId)
          : false,
      });
      traceResourceOp("saveQueue", "drain", "start", {
        source: req.source,
        fileId8: savingFileId?.slice(0, 8) ?? null,
      });
      log.info("save start", { source: req.source });
      result = await executor!(req);
      traceSaveFlow(
        "drain",
        {
          source: req.source,
          saved: result.saved,
          skipped: !!result.skipped,
          fileId8: id8(result.fileId),
          sha8: result.contentSha256?.slice(0, 8) ?? null,
        },
        "ok",
      );
      traceUserAction(
        "saveQueue",
        "drain",
        {
          source: req.source,
          saved: result.saved,
          skipped: !!result.skipped,
          fileId8: result.fileId?.slice(0, 8) ?? null,
          sha8: result.contentSha256?.slice(0, 8) ?? null,
        },
        "ok",
      );
      traceResourceOp("saveQueue", "drain", "ok", {
        source: req.source,
        saved: result.saved,
        skipped: !!result.skipped,
      });
      log.info("save done", { source: req.source, saved: result.saved });
    } catch (e) {
      traceUserAction(
        "saveQueue",
        "drain",
        {
          source: req.source,
          message: e instanceof Error ? e.message : String(e),
        },
        "fail",
      );
      log.debug("save failed", e);
    } finally {
      rememberCompletedRequest(runningRequestId, result);
      if (savingFileId) {
        clearThumbnailSavePending([savingFileId]);
      }
      if (result.fileId && result.fileId !== savingFileId) {
        clearThumbnailSavePending([result.fileId]);
      }
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
  if (!executor) {
    traceUserAction("saveQueue", "requestSave", { source: req.source }, "skip");
    log.debug("requestSave ignored: no executor installed");
    return;
  }

  if (shouldIgnoreSaveRequest(req)) {
    traceUserAction(
      "saveQueue",
      "requestSave",
      {
        source: req.source,
        reason: "disabled-source",
      },
      "skip",
    );
    log.debug("requestSave ignored: disabled source", { source: req.source });
    return;
  }

  if (getCompletedRequestResult(req.requestId)) {
    log.debug("requestSave ignored: duplicate completed request", {
      requestId: req.requestId,
    });
    return;
  }

  if (hasSameRequestId(req.requestId, runningRequestId)) {
    log.debug("requestSave ignored: duplicate running request", {
      requestId: req.requestId,
    });
    return;
  }

  if (pending) {
    pending = mergeRequest(pending, req);
    traceUserAction(
      "saveQueue",
      "requestSave",
      {
        source: req.source,
        mergedInto: pending.source,
        requestId: req.requestId ?? null,
      },
      "branch",
    );
  } else {
    pending = { ...req };
  }

  const isUserAction = SOURCE_PRIORITY[req.source] >= SOURCE_PRIORITY.home;
  traceUserAction(
    "saveQueue",
    "requestSave",
    {
      source: req.source,
      immediate: isUserAction,
      requestId: req.requestId ?? null,
    },
    "ok",
  );
  scheduleFlush(isUserAction);
}

/**
 * 投递一个保存请求并等待完成（用于需要等结果的场景，如 home 导航）。
 * 如果已有 pending 请求，合并后共享同一次保存的结果。
 * 如果当前有保存在执行，等待其完成后再执行合并后的新请求。
 */
export function requestSaveAndWait(req: SaveRequest): Promise<SaveResult> {
  if (!executor) {
    return Promise.resolve(NO_SAVE);
  }

  if (shouldIgnoreSaveRequest(req)) {
    return Promise.resolve(NO_SAVE);
  }

  const completed = getCompletedRequestResult(req.requestId);
  if (completed) {
    return Promise.resolve(completed);
  }

  if (hasSameRequestId(req.requestId, runningRequestId)) {
    return runningPromise ?? Promise.resolve(NO_SAVE);
  }

  if (pending) {
    pending = mergeRequest(pending, req);
  } else {
    pending = { ...req };
  }

  clearCoalesceTimer();

  if (running) {
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
 * executor 不需要处理：跨页 broadcast（由 ServerSync.dispatchServerSavedEvents 统一发出）
 */
export function installExecutor(
  fn: SaveExecutor,
  opts?: { getCurrentFileId?: CurrentFileIdGetter },
): () => void {
  executor = fn;
  getCurrentFileId = opts?.getCurrentFileId ?? null;
  completedRequests.clear();
  traceUserAction("saveQueue", "installExecutor", {}, "ok");
  return () => {
    if (executor === fn) {
      executor = null;
      getCurrentFileId = null;
    }
    clearCoalesceTimer();
    pending = null;
  };
}

/** 当前是否有保存正在执行 */
export function isSaveInFlight(): boolean {
  return running;
}
