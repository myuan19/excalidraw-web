/**
 * 应用级设置：持久化在 localStorage，全局内存缓存 + 订阅通知。
 * 与 AI 配置独立，AI 配置走 server SQLite。
 */

/** 空闲自动保存可选等待时间（秒） */
export const AUTO_SAVE_IDLE_SEC_OPTIONS = [1, 2, 5, 10, 30, 60, 120, 300] as const;

export interface AppSettings {
  /** 切换到后台（visibilitychange → hidden）时自动保存到服务器 */
  autoSaveOnBlur: boolean;
  /** 空闲一段时间无编辑后自动保存 */
  autoSaveEnabled: boolean;
  /** 空闲自动保存等待时间（秒），编辑停止后多久触发保存 */
  autoSaveIdleSec: number;
  /** 离开编辑器时自动保存（需同时开启空闲自动保存） */
  autoSaveOnExit: boolean;
}

const STORAGE_KEY = "editorhub-app-settings";

const DEFAULT_SETTINGS: AppSettings = {
  autoSaveOnBlur: true,
  autoSaveEnabled: false,
  autoSaveIdleSec: 10,
  autoSaveOnExit: false,
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

function load(): AppSettings {
  if (loaded) {
    return cache;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      cache = {
        autoSaveOnBlur:
          typeof parsed.autoSaveOnBlur === "boolean"
            ? parsed.autoSaveOnBlur
            : DEFAULT_SETTINGS.autoSaveOnBlur,
        autoSaveEnabled:
          typeof parsed.autoSaveEnabled === "boolean"
            ? parsed.autoSaveEnabled
            : DEFAULT_SETTINGS.autoSaveEnabled,
        autoSaveIdleSec:
          typeof parsed.autoSaveIdleSec === "number" &&
          (AUTO_SAVE_IDLE_SEC_OPTIONS as readonly number[]).includes(
            parsed.autoSaveIdleSec,
          )
            ? parsed.autoSaveIdleSec
            : DEFAULT_SETTINGS.autoSaveIdleSec,
        autoSaveOnExit:
          typeof parsed.autoSaveOnExit === "boolean"
            ? parsed.autoSaveOnExit
            : DEFAULT_SETTINGS.autoSaveOnExit,
      };
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

export function updateAppSettings(
  partial: Partial<AppSettings>,
): AppSettings {
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

/** 空闲自动保存与离开自动保存均已开启 */
export function isAutoSaveOnExitActive(): boolean {
  const settings = getAppSettings();
  return settings.autoSaveEnabled && settings.autoSaveOnExit;
}
