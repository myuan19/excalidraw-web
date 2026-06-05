/**
 * 空闲自动保存 + Session 级存档覆盖
 *
 * 核心逻辑：
 * 1. 每次编辑变更时调用 `notifyEdit()`，重置空闲计时器
 * 2. 空闲 N 秒后自动触发一次保存到服务器
 * 3. 保存产生的存档用 `auto:${sessionId}` 作为 label
 * 4. 同一 session 内的下次自动保存会先删除上一次的自动存档再创建新的
 * 5. session ID 只在内存中，页面关闭/导航离开即丢失
 *    → 下次打开同一文件时旧的自动存档永久保留
 */

import { getAppSettings } from "./appSettings";
import { ServerSync, type ArchiveEntry } from "./ServerSync";
import { createLogger } from "../lib/logger";

const log = createLogger({ module: "autoSave" });

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

export function formatAutoSaveLabel(label: string): string {
  if (!isAutoSaveLabel(label)) {
    return label;
  }
  return "自动保存";
}

/**
 * 保存成功后调用：把最新那条空 label 存档标记为当前 session 的自动存档，
 * 并删除同 session 之前的那条自动存档（如果有的话）。
 *
 * 这样同一 session 内始终只保留一条自动存档。
 */
export async function manageSessionAutoArchive(
  fileId: string,
): Promise<void> {
  const currentLabel = makeAutoLabel();
  try {
    const archives = await ServerSync.listArchives(fileId);

    const oldAutoArchive = archives.find((a) => a.label === currentLabel);

    const newestEmptyLabel = archives.find((a) => a.label === "");
    if (newestEmptyLabel) {
      await ServerSync.patchArchiveLabel(
        fileId,
        newestEmptyLabel.id,
        currentLabel,
      );
      log.debug("labeled newest archive as session auto-save", {
        fileId8: fileId.slice(0, 8),
        archiveId: newestEmptyLabel.id.slice(0, 8),
      });
    }

    if (oldAutoArchive) {
      await ServerSync.deleteArchive(fileId, oldAutoArchive.id);
      log.debug("deleted old session auto-archive", {
        fileId8: fileId.slice(0, 8),
        archiveId: oldAutoArchive.id.slice(0, 8),
      });
    }
  } catch (e) {
    log.debug("manage session auto-archive failed (non-fatal)", e);
  }
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

// ---------------------------------------------------------------------------
// BroadcastChannel 跨 tab 同步
// ---------------------------------------------------------------------------

const CHANNEL_NAME = "editorhub-sync";

type SyncMessage = {
  type: "file-saved";
  fileId: string;
  timestamp: number;
};

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") {
    return null;
  }
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
}

/**
 * 保存成功后调用，通知其他 tab 刷新
 */
export function broadcastFileSaved(fileId: string): void {
  try {
    getChannel()?.postMessage({
      type: "file-saved",
      fileId,
      timestamp: Date.now(),
    } satisfies SyncMessage);
  } catch {
    // BroadcastChannel not available or closed
  }
}

/**
 * 监听其他 tab 的保存事件。
 * 返回取消监听函数。
 */
export function onCrossTabFileSaved(
  callback: (fileId: string) => void,
): () => void {
  const ch = getChannel();
  if (!ch) {
    return () => {};
  }
  const handler = (event: MessageEvent<SyncMessage>) => {
    if (event.data?.type === "file-saved" && event.data.fileId) {
      callback(event.data.fileId);
    }
  };
  ch.addEventListener("message", handler);
  return () => ch.removeEventListener("message", handler);
}
