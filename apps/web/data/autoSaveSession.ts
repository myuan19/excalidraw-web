/**
 * 空闲自动保存 + Session 级存档覆盖
 *
 * 核心逻辑：
 * 1. 每次编辑变更时调用 `notifyEdit()`，重置空闲计时器
 * 2. 空闲 N 秒后自动触发一次保存到服务器
 * 3. 自动保存请求携带 `auto:${sessionId}` label，由服务端在写入版本时覆盖同 session 旧档
 * 4. `auto` 与 `visibility` 都按自动保存历史版本处理，避免后台保存污染普通历史
 * 5. session ID 只在内存中，页面关闭/导航离开即丢失
 *    → 下次打开同一文件时旧的自动存档永久保留
 */

import { getAppSettings } from "./appSettings";
import { getFileIdFromHash } from "./fileIdFromHash";
import { isLocalDraftFileId } from "./localDraftFileId";
import { createLogger } from "../lib/logger";
export {
  broadcastFileSaved,
  onCrossTabFileSaved,
} from "./crossTabFileSync";

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

let globalSessionId: string | null = null;

function ensureSessionId(): string {
  if (!globalSessionId) {
    globalSessionId = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
  return globalSessionId;
}

function makeAutoLabel(): string {
  return `auto:${ensureSessionId()}`;
}

const AUTO_LABEL_PREFIX = "auto:";

export function isAutoSaveLabel(label: string): boolean {
  return label.startsWith(AUTO_LABEL_PREFIX);
}

export function resolveAutoSaveArchiveLabel(source: string): string | undefined {
  return source === "auto" || source === "visibility"
    ? makeAutoLabel()
    : undefined;
}

/** 重置 session（换文件 / 离开编辑器时调用） */
export function resetAutoSaveSession(): void {
  globalSessionId = null;
}

// ---------------------------------------------------------------------------
// 空闲检测计时器
// ---------------------------------------------------------------------------

type AutoSaveTrigger = () => void;

let idleTimer: number | null = null;
let triggerFn: AutoSaveTrigger | null = null;

function clearIdleTimer() {
  if (idleTimer != null) {
    window.clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function startIdleTimer() {
  clearIdleTimer();
  const settings = getAppSettings();
  if (!settings.autoSaveEnabled) {
    return;
  }
  idleTimer = window.setTimeout(() => {
    idleTimer = null;
    if (!getAppSettings().autoSaveEnabled) {
      return;
    }
    if (!isAutoSaveEligibleForCurrentFile()) {
      return;
    }
    log.info("idle auto-save triggered");
    triggerFn?.();
  }, settings.autoSaveIdleSec * 1000);
}

/**
 * 编辑器每次检测到编辑变更时调用此方法。
 * 它会重置空闲计时器——只有持续无编辑 N 秒后才触发自动保存。
 */
export function notifyEdit(): void {
  if (!getAppSettings().autoSaveEnabled) {
    return;
  }
  if (!isAutoSaveEligibleForCurrentFile()) {
    clearIdleTimer();
    return;
  }
  startIdleTimer();
}

/**
 * 注册自动保存回调（保存到服务器的函数）。
 * 每次注册会重置 session ID（新的文件打开 = 新 session）。
 * 返回取消注册函数。
 */
export function registerAutoSaveTrigger(fn: AutoSaveTrigger): () => void {
  resetAutoSaveSession();
  triggerFn = fn;
  return () => {
    if (triggerFn === fn) {
      triggerFn = null;
    }
    clearIdleTimer();
  };
}
