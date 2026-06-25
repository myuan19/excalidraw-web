/**
 * 应用级设置：持久化在 localStorage，全局内存缓存 + 订阅通知。
 * 与 AI 配置独立，AI 配置走 server SQLite。
 */

/** 空闲自动保存可选等待时间（秒）；0 表示不开启空闲等待保存。 */
export const AUTO_SAVE_IDLE_SEC_OPTIONS = [
  0, 1, 2, 5, 10, 30, 60, 120, 300,
] as const;

/** checkpoint 间隔检查可选时间（分钟） */
export const CHECKPOINT_INTERVAL_MIN_OPTIONS = [10, 20, 30, 60, 720] as const;

export const DEBUG_LOGGING_MODE_OPTIONS = ["off", "basic", "ai"] as const;
export type DebugLoggingMode = typeof DEBUG_LOGGING_MODE_OPTIONS[number];

export interface AppSettings {
  /** 自动保存总开关：控制退出/切换时直接保存；空闲等待保存还需 autoSaveIdleSec > 0。 */
  autoSaveEnabled: boolean;
  /** 空闲自动保存等待时间（秒），0 表示不自动等待触发保存。 */
  autoSaveIdleSec: number;
  /** 保存到 latest 时 checkpoint 间隔检查的阈值（分钟） */
  checkpointIntervalMin: number;
  /** Debug 日志模式：off=关闭，basic=本地详细日志，ai=远程采集/AI 调试。 */
  debugLoggingMode: DebugLoggingMode;
  /** @deprecated 兼容旧设置；新代码使用 debugLoggingMode。 */
  debugLoggingEnabled: boolean;
  /** 桌面端新建内容默认落盘目录。 */
  defaultDataDirectoryPath: string;
}

const STORAGE_KEY = "editorhub-app-settings";
export const DEBUG_LOGGING_STORAGE_KEY = "editorhub-debug-logging";
export const MINDMAP_FULL_DUMP_STORAGE_KEY = "editorhub-mindmap-log-full";
export const DEFAULT_DATA_DIRECTORY_PATH = "Documents/EditorHub";

const DEFAULT_SETTINGS: AppSettings = {
  autoSaveEnabled: false,
  autoSaveIdleSec: 10,
  checkpointIntervalMin: 30,
  debugLoggingMode: "off",
  debugLoggingEnabled: false,
  defaultDataDirectoryPath: DEFAULT_DATA_DIRECTORY_PATH,
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

function syncDebugLoggingStorage(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.setItem(DEBUG_LOGGING_STORAGE_KEY, "1");
      localStorage.setItem(MINDMAP_FULL_DUMP_STORAGE_KEY, "1");
      return;
    }
    localStorage.removeItem(DEBUG_LOGGING_STORAGE_KEY);
    localStorage.removeItem(MINDMAP_FULL_DUMP_STORAGE_KEY);
  } catch {
    // ignore storage failures
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
  const debugLoggingMode = (
    DEBUG_LOGGING_MODE_OPTIONS as readonly unknown[]
  ).includes(parsed.debugLoggingMode)
    ? (parsed.debugLoggingMode as DebugLoggingMode)
    : typeof parsed.debugLoggingEnabled === "boolean" &&
      parsed.debugLoggingEnabled
    ? "ai"
    : DEFAULT_SETTINGS.debugLoggingMode;
  const defaultDataDirectoryPath =
    typeof parsed.defaultDataDirectoryPath === "string" &&
    parsed.defaultDataDirectoryPath.trim()
      ? parsed.defaultDataDirectoryPath.trim()
      : DEFAULT_SETTINGS.defaultDataDirectoryPath;

  return {
    autoSaveEnabled,
    autoSaveIdleSec,
    checkpointIntervalMin,
    debugLoggingMode,
    debugLoggingEnabled: debugLoggingMode !== "off",
    defaultDataDirectoryPath,
  };
}

function load(): AppSettings {
  if (loaded) {
    return cache;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      cache = normalizeSettings(JSON.parse(raw) as Record<string, unknown>);
    } else if (localStorage.getItem(DEBUG_LOGGING_STORAGE_KEY) === "1") {
      cache = normalizeSettings({ debugLoggingEnabled: true });
    }
    syncDebugLoggingStorage(cache.debugLoggingMode !== "off");
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
  const merged: AppSettings = { ...current, ...partial };
  if ("debugLoggingMode" in partial) {
    merged.debugLoggingEnabled = merged.debugLoggingMode !== "off";
  } else if ("debugLoggingEnabled" in partial) {
    merged.debugLoggingMode = merged.debugLoggingEnabled ? "ai" : "off";
  }
  const next = normalizeSettings(merged as unknown as Record<string, unknown>);
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    if ("debugLoggingMode" in partial || "debugLoggingEnabled" in partial) {
      syncDebugLoggingStorage(next.debugLoggingMode !== "off");
    }
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

/** 编辑停止一段时间后是否触发保存；与退出/切换保存解耦。 */
export function isIdleAutoSaveActive(): boolean {
  const settings = getAppSettings();
  return settings.autoSaveEnabled && settings.autoSaveIdleSec > 0;
}

export function isDebugLoggingEnabled(): boolean {
  return getDebugLoggingMode() !== "off";
}

export function getDebugLoggingMode(): DebugLoggingMode {
  return getAppSettings().debugLoggingMode;
}

export function isAiDebugLoggingEnabled(): boolean {
  return getDebugLoggingMode() === "ai";
}
