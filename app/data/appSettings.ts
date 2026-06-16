/**
 * 应用级设置：持久化在 localStorage，全局内存缓存 + 订阅通知。
 * 与 AI 配置独立，AI 配置走 server SQLite。
 */

/** 空闲自动保存可选等待时间（秒） */
export const AUTO_SAVE_IDLE_SEC_OPTIONS = [
  1, 2, 5, 10, 30, 60, 120, 300,
] as const;

/** checkpoint 间隔检查可选时间（分钟） */
export const CHECKPOINT_INTERVAL_MIN_OPTIONS = [10, 20, 30, 60, 720] as const;

export interface AppSettings {
  /** 自动保存：空闲保存、离开直接保存；关闭后仅手动或离开确认时保存 */
  autoSaveEnabled: boolean;
  /** 空闲自动保存等待时间（秒），编辑停止后多久触发保存 */
  autoSaveIdleSec: number;
  /** 保存到 latest 时 checkpoint 间隔检查的阈值（分钟） */
  checkpointIntervalMin: number;
}

const STORAGE_KEY = "editorhub-app-settings";

const DEFAULT_SETTINGS: AppSettings = {
  autoSaveEnabled: false,
  autoSaveIdleSec: 10,
  checkpointIntervalMin: 30,
};

let cache: AppSettings = { ...DEFAULT_SETTINGS };
let loaded = false;

const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // ignore
    }
  }
}

function normalizeSettings(parsed: Record<string, unknown>): AppSettings {
  const autoSaveEnabled =
    typeof parsed.autoSaveEnabled === "boolean"
      ? parsed.autoSaveEnabled
      : DEFAULT_SETTINGS.autoSaveEnabled;

  const autoSaveIdleSec =
    typeof parsed.autoSaveIdleSec === "number" &&
    (AUTO_SAVE_IDLE_SEC_OPTIONS as readonly number[]).includes(
      parsed.autoSaveIdleSec,
    )
      ? parsed.autoSaveIdleSec
      : DEFAULT_SETTINGS.autoSaveIdleSec;

  const checkpointIntervalMin =
    typeof parsed.checkpointIntervalMin === "number" &&
    (CHECKPOINT_INTERVAL_MIN_OPTIONS as readonly number[]).includes(
      parsed.checkpointIntervalMin,
    )
      ? parsed.checkpointIntervalMin
      : DEFAULT_SETTINGS.checkpointIntervalMin;

  return { autoSaveEnabled, autoSaveIdleSec, checkpointIntervalMin };
}

function load(): AppSettings {
  if (loaded) {
    return cache;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      cache = normalizeSettings(parsed);
    }
  } catch {
    // ignore
  }
  loaded = true;
  return cache;
}

export function getAppSettings(): AppSettings {
  return load();
}

export function updateAppSettings(partial: Partial<AppSettings>): AppSettings {
  const current = load();
  const next: AppSettings = { ...current, ...partial };
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // quota
  }
  notify();
  return next;
}

export function subscribeAppSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 离开编辑器时是否直接保存（无需确认） */
export function isAutoSaveOnExitActive(): boolean {
  return getAppSettings().autoSaveEnabled;
}
