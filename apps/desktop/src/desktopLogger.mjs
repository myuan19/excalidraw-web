/**
 * Desktop 专用结构化日志（JSON Lines）。
 * 仅由 apps/desktop 引用；Web 构建与 server 默认路径不受影响。
 *
 * 日志文件：{logDir}/desktop-op.log
 * logDir 优先级：EDITORHUB_DESKTOP_LOG_DIR → Electron userData/logs → APPDATA/LOCALAPPDATA/TEMP
 *
 * 环境变量（仅在 Desktop 启动时由 main 注入，Web 不会设置）：
 * - EDITORHUB_DESKTOP=1           标记桌面模式
 * - EDITORHUB_DESKTOP_DEBUG=0     关闭详细 API/文件操作日志（默认开启）
 * - EDITORHUB_DESKTOP_QUIET=1     关闭 HTTP trace / API debug 等 server 侧增强日志
 * - EDITORHUB_DESKTOP_LOG_DIR     自定义日志目录
 */
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const LOG_BASENAME = "desktop-op.log";

let cachedLogPaths = null;
let primaryLogPath = null;

function envFlagOff(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized === "0" || normalized === "false" || normalized === "off" || normalized === "no";
}

export function isDesktopDebugEnabled() {
  return !envFlagOff(process.env.EDITORHUB_DESKTOP_DEBUG);
}

export function isDesktopQuiet() {
  return envFlagOff(process.env.EDITORHUB_DESKTOP_QUIET);
}

export function formatDesktopError(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      code: value.code,
    };
  }
  return value;
}

export function truncDesktopStr(value, max = 200) {
  if (typeof value !== "string") {
    return value;
  }
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}…(len=${value.length})`;
}

/**
 * @param {() => string[]} pathResolver
 */
export function configureDesktopLogPaths(pathResolver) {
  cachedLogPaths = pathResolver().map((dir) => path.join(dir, LOG_BASENAME));
  primaryLogPath = cachedLogPaths[0] ?? null;
}

function resolveLogPaths() {
  if (cachedLogPaths?.length) {
    return cachedLogPaths;
  }
  const envDir = process.env.EDITORHUB_DESKTOP_LOG_DIR?.trim();
  const candidates = [
    envDir,
    process.env.EXCALIDRAW_LOG_DIR?.trim(),
    process.env.APPDATA && path.join(process.env.APPDATA, "EditorHub", "logs"),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "EditorHub", "logs"),
    process.env.TEMP && path.join(process.env.TEMP, "EditorHub", "logs"),
  ].filter(Boolean);
  cachedLogPaths = [...new Set(candidates)].map((dir) => path.join(dir, LOG_BASENAME));
  primaryLogPath = cachedLogPaths[0] ?? null;
  return cachedLogPaths;
}

export function getDesktopOpLogPath() {
  resolveLogPaths();
  return primaryLogPath;
}

/**
 * @param {string} category  例如 main / server / files
 * @param {string} event
 * @param {Record<string, unknown>} [details]
 */
export function writeDesktopLog(category, event, details = {}) {
  try {
    const line = `${JSON.stringify({
      ts: new Date().toISOString(),
      category,
      event,
      pid: process.pid,
      details: formatDesktopError(details),
    })}\n`;
    for (const logPath of resolveLogPaths()) {
      try {
        mkdirSync(path.dirname(logPath), { recursive: true });
        appendFileSync(logPath, line, "utf8");
      } catch {
        // 单个目录无权限时不阻断启动。
      }
    }
  } catch {
    // 日志失败不得影响业务。
  }
}

/**
 * Desktop 启动时调用：打开 server 侧文件日志与 HTTP 追踪（仅进程内 env，不影响 Web 部署）。
 * @param {{ logDir: string, dataDir: string }} paths
 */
export function applyDesktopServerLogEnv(paths) {
  process.env.EDITORHUB_DESKTOP = "1";
  process.env.EXCALIDRAW_DATA_DIR ||= paths.dataDir;
  process.env.EXCALIDRAW_LOG_DIR ||= paths.logDir;
  process.env.EXCALIDRAW_LOG_TO_FILE ||= "1";

  if (!isDesktopQuiet()) {
    process.env.EXCALIDRAW_HTTP_TRACE ||= "1";
    process.env.EXCALIDRAW_API_DEBUG ||= "1";
  }

  writeDesktopLog("server", "log-env-configured", {
    dataDir: process.env.EXCALIDRAW_DATA_DIR,
    logDir: process.env.EXCALIDRAW_LOG_DIR,
    httpTrace: process.env.EXCALIDRAW_HTTP_TRACE ?? "",
    apiDebug: process.env.EXCALIDRAW_API_DEBUG ?? "",
    desktopDebug: isDesktopDebugEnabled(),
    quiet: isDesktopQuiet(),
  });
}
