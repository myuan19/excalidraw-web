/**
 * 应用级设置：持久化在 localStorage，全局内存缓存 + 订阅通知。
 * 与 AI 配置独立，AI 配置走 server SQLite。
 */

export interface AppSettings {
  /** 切换到后台（visibilitychange → hidden）时自动保存到服务器 */
  autoSaveOnBlur: boolean;
  /** 定时自动保存（编辑中每隔一段时间自动保存） */
  autoSaveEnabled: boolean;
  /** 自动保存间隔（秒），仅 autoSaveEnabled 为 true 时生效 */
  autoSaveIntervalSec: number;
}

const STORAGE_KEY = "editorhub-app-settings";

const DEFAULT_SETTINGS: AppSettings = {
  autoSaveOnBlur: true,
  autoSaveEnabled: false,
  autoSaveIntervalSec: 120,
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
        autoSaveIntervalSec:
          typeof parsed.autoSaveIntervalSec === "number" &&
          parsed.autoSaveIntervalSec >= 10
            ? parsed.autoSaveIntervalSec
            : DEFAULT_SETTINGS.autoSaveIntervalSec,
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
