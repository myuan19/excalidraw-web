/**
 * 统一保存队列（生产-消费模式）
 *
 * 所有保存触发源（visibility、auto、hotkey、toolbar、sidebar、home）
 * 统一调用 `requestSave()` 投递保存事件。队列负责：
 *
 * 1. **合并**：短时间内（COALESCE_MS）多次触发只执行一次保存
 * 2. **串行**：上一次保存完成前不启动下一次，避免并发竞争
 * 3. **优先级**：合并时保留优先级最高的 source（用户主动 > 自动）
 * 4. **后处理**：保存成功后统一执行 broadcastFileSaved
 *
 * 编辑器只需在初始化时 `installExecutor(fn)` 注册实际保存函数，
 * 各触发点改为 `requestSave({ source })` 即可。
 */

import type { SaveToServerSource } from "../hooks/types";
import { broadcastFileSaved } from "./crossTabFileSync";
import { createLogger } from "../lib/logger";

const log = createLogger({ module: "saveQueue" });

const COALESCE_MS = 300;

const SOURCE_PRIORITY: Record<SaveToServerSource, number> = {
  toolbar: 10,
  hotkey: 10,
  sidebar: 10,
  home: 9,
  visibility: 5,
  auto: 1,
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
}

export interface SaveResult {
  saved: boolean;
  /** 服务器内容去重命中（内容没变），不广播跨页刷新 */
  skipped?: boolean;
  fileId?: string;
  /** 服务器返回的 content_sha256，随广播下发 */
  contentSha256?: string | null;
}

type SaveExecutor = (req: SaveRequest) => Promise<SaveResult>;

let executor: SaveExecutor | null = null;
let pending: SaveRequest | null = null;
let pendingResolvers: Array<(r: SaveResult) => void> = [];
let coalesceTimer: number | null = null;
let running = false;
let runningPromise: Promise<SaveResult> | null = null;

function clearCoalesceTimer() {
  if (coalesceTimer != null) {
    window.clearTimeout(coalesceTimer);
    coalesceTimer = null;
  }
}

function mergeRequest(existing: SaveRequest, incoming: SaveRequest): SaveRequest {
  return {
    source: higherPrioritySource(existing.source, incoming.source),
    navigateAfter: existing.navigateAfter || incoming.navigateAfter,
    forceThumbnail: existing.forceThumbnail || incoming.forceThumbnail,
  };
}

const NO_SAVE: SaveResult = { saved: false };

async function drain(): Promise<SaveResult> {
  if (!pending || !executor) {
    return NO_SAVE;
  }
  if (running) {
    return runningPromise ?? Promise.resolve(NO_SAVE);
  }
  running = true;
  const req = pending;
  const resolvers = pendingResolvers;
  pending = null;
  pendingResolvers = [];

  let result: SaveResult = NO_SAVE;
  const p = (async () => {
    try {
      log.info("save start", { source: req.source });
      result = await executor!(req);
      log.info("save done", { source: req.source, saved: result.saved });

      if (result.saved && result.fileId && !result.skipped) {
        log.info("broadcast file-saved", {
          source: req.source,
          fileId8: result.fileId.slice(0, 8),
          sha8: result.contentSha256?.slice(0, 8) ?? null,
        });
        broadcastFileSaved(result.fileId, result.contentSha256);
      }
    } catch (e) {
      log.debug("save failed", e);
    } finally {
      running = false;
      runningPromise = null;
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
    log.debug("requestSave ignored: no executor installed");
    return;
  }

  if (pending) {
    pending = mergeRequest(pending, req);
  } else {
    pending = { ...req };
  }

  const isUserAction = SOURCE_PRIORITY[req.source] >= SOURCE_PRIORITY.home;
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
 * executor 不需要处理：broadcastFileSaved（队列统一做）
 */
export function installExecutor(fn: SaveExecutor): () => void {
  executor = fn;
  return () => {
    if (executor === fn) {
      executor = null;
    }
    clearCoalesceTimer();
    pending = null;
  };
}

/** 当前是否有保存正在执行 */
export function isSaveInFlight(): boolean {
  return running;
}
