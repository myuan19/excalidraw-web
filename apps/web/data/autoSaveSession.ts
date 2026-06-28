/**
 * 空闲自动保存 + Session 级存档覆盖
 *
 * 核心逻辑：
 * 1. 每次编辑变更时调用 `notifyEdit()`，重置空闲计时器
 * 2. 空闲等待时间大于 0 时，空闲 N 秒后自动触发一次保存到服务器
 * 3. 自动保存只负责更新 latest；是否生成 checkpoint 由 checkpointPolicy 决定
 */

import {
  getAppSettings,
  isIdleAutoSaveActive,
  subscribeAppSettings,
} from "./appSettings";
import { FileSyncState } from "./FileSyncState";
import { getFileIdFromHash } from "./fileIdFromHash";
import { isLocalDraftFileId } from "./localDraftFileId";
import { createLogger } from "../lib/logger";
import { traceUserAction } from "../lib/userTrace";
export { broadcastFileSaved, onCrossTabFileSaved } from "./crossTabFileSync";

const log = createLogger({ module: "autoSave" });

/** 仅对已入库到「所有文件」的服务器文档启用自动保存 */
export function isAutoSaveEligibleFile(
  fileId: string | null | undefined,
): boolean {
  return !!fileId && !isLocalDraftFileId(fileId);
}

export function isAutoSaveEligibleForCurrentFile(): boolean {
  return isAutoSaveEligibleFile(getFileIdFromHash());
}

const AUTO_LABEL_PREFIX = "auto:";

/** 兼容旧数据：历史里可能已经存在 auto:* label。 */
export function isAutoSaveLabel(label: string): boolean {
  return label.startsWith(AUTO_LABEL_PREFIX);
}

// ---------------------------------------------------------------------------
// 空闲检测计时器
// ---------------------------------------------------------------------------

export type AutoSaveTriggerResult = void | "deferred";
export type AutoSaveTrigger = () => AutoSaveTriggerResult;

export type IdleAutoSaveRearmOpts = {
  /** 编辑器因 hydrate 等暂时无法保存时，仍应重新排队空闲保存。 */
  pendingDeferred?: boolean | (() => boolean);
  /** cached/pinned 后台 pane 仍应对自己的 fileId 排队空闲保存。 */
  allowInactiveFile?: boolean;
};

function isActiveAutoSaveFile(
  fileId: string,
  opts?: IdleAutoSaveRearmOpts,
): boolean {
  if (opts?.allowInactiveFile) {
    return true;
  }
  return getFileIdFromHash() === fileId;
}

function isPendingDeferred(
  opts?: IdleAutoSaveRearmOpts,
): boolean {
  const pending = opts?.pendingDeferred;
  return typeof pending === "function" ? pending() : pending === true;
}

/** 当前文件是否有待处理的空闲自动保存（未保存编辑或显式 deferred）。 */
export function fileNeedsIdleAutoSave(
  fileId: string,
  opts?: IdleAutoSaveRearmOpts,
): boolean {
  return FileSyncState.hasUnsavedChanges(fileId) || isPendingDeferred(opts);
}

/** 仅对活跃 Tab 上的 eligible 文件，在有空闲保存待处理时返回 true。 */
export function shouldRearmIdleAutoSave(
  fileId: string | null | undefined,
  opts?: IdleAutoSaveRearmOpts,
): boolean {
  if (!isAutoSaveEligibleFile(fileId)) {
    return false;
  }
  if (!isIdleAutoSaveActive()) {
    return false;
  }
  if (!fileId || !isActiveAutoSaveFile(fileId, opts)) {
    return false;
  }
  return fileNeedsIdleAutoSave(fileId, opts);
}

/** 按未保存/deferred 条件重新启动全局空闲计时器。 */
export function rearmIdleAutoSaveIfNeeded(
  fileId: string | null | undefined,
  opts?: IdleAutoSaveRearmOpts,
): boolean {
  if (!shouldRearmIdleAutoSave(fileId, opts)) {
    return false;
  }
  deferredAutoSave = false;
  startIdleTimer();
  return true;
}

let idleTimer: number | null = null;
let triggerFn: AutoSaveTrigger | null = null;
let deferredAutoSave = false;

function clearIdleTimer() {
  if (idleTimer != null) {
    window.clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function refreshIdleTimerForSettingsChange() {
  if (!isIdleAutoSaveActive()) {
    deferredAutoSave = false;
    clearIdleTimer();
    return;
  }
  const fileId = getFileIdFromHash();
  if (!isAutoSaveEligibleFile(fileId)) {
    clearIdleTimer();
    return;
  }
  if (!fileId || !FileSyncState.hasUnsavedChanges(fileId)) {
    clearIdleTimer();
    return;
  }
  startIdleTimer();
}

function startIdleTimer() {
  clearIdleTimer();
  const settings = getAppSettings();
  if (!isIdleAutoSaveActive()) {
    return;
  }
  idleTimer = window.setTimeout(() => {
    idleTimer = null;
    if (!isIdleAutoSaveActive()) {
      return;
    }
    if (!isAutoSaveEligibleForCurrentFile()) {
      deferredAutoSave = false;
      return;
    }
    traceUserAction(
      "save",
      "autoSaveIdleTrigger",
      {
        fileId8: getFileIdFromHash()?.slice(0, 8) ?? null,
      },
      "start",
    );
    log.info("idle auto-save triggered");
    const result = triggerFn?.();
    deferredAutoSave = result === "deferred";
    if (deferredAutoSave) {
      log.info("idle auto-save deferred");
    }
  }, settings.autoSaveIdleSec * 1000);
}

subscribeAppSettings(refreshIdleTimerForSettingsChange);

/**
 * 编辑器每次检测到编辑变更时调用此方法。
 * 它会重置空闲计时器——只有持续无编辑 N 秒后才触发自动保存。
 */
export function notifyEditForFile(
  fileId: string | null | undefined,
  opts?: Pick<IdleAutoSaveRearmOpts, "allowInactiveFile">,
): void {
  deferredAutoSave = false;
  if (!isIdleAutoSaveActive()) {
    clearIdleTimer();
    return;
  }
  if (!isAutoSaveEligibleFile(fileId)) {
    clearIdleTimer();
    return;
  }
  if (!fileId || !isActiveAutoSaveFile(fileId, opts)) {
    clearIdleTimer();
    return;
  }
  startIdleTimer();
}

export function notifyEdit(): void {
  notifyEditForFile(getFileIdFromHash());
}

/**
 * 编辑器曾因短暂不可保存状态（如 hydrate）延后 auto-save。
 * 状态解除后由编辑器调用，重新回到统一 idle 计时器，而不是绕过保存队列。
 */
export function rearmDeferredAutoSave(): boolean {
  if (!deferredAutoSave) {
    return false;
  }
  deferredAutoSave = false;
  if (!isIdleAutoSaveActive()) {
    clearIdleTimer();
    return false;
  }
  if (!isAutoSaveEligibleForCurrentFile()) {
    clearIdleTimer();
    return false;
  }
  log.info("deferred idle auto-save rearmed");
  startIdleTimer();
  return true;
}

export function clearDeferredAutoSave(): void {
  deferredAutoSave = false;
}

/**
 * 注册自动保存回调（保存到服务器的函数）。
 * 返回取消注册函数。
 */
export function registerAutoSaveTrigger(fn: AutoSaveTrigger): () => void {
  deferredAutoSave = false;
  triggerFn = fn;
  return () => {
    if (triggerFn === fn) {
      triggerFn = null;
    }
    deferredAutoSave = false;
    clearIdleTimer();
  };
}
