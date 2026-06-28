/**
 * Desktop 专用结构化日志（JSON Lines）。
 * 仅由 apps/desktop 引用；Web 构建与 server 默认路径不受影响。
 *
 * 日志文件：{logDir}/desktop-op-<session>.log
 * logDir 优先级：EDITORHUB_DESKTOP_LOG_DIR → Electron userData/logs → APPDATA/LOCALAPPDATA/TEMP
 *
 * 环境变量（仅在 Desktop 启动时由 main 注入，Web 不会设置）：
 * - EDITORHUB_DESKTOP=1           标记桌面模式
 * - EDITORHUB_DESKTOP_DEBUG=1     开启 Web 端 Debug capability（可在设置里打开调试日志）
 * - EDITORHUB_DESKTOP_DEBUG=0     关闭详细 API/文件操作日志（默认开启）
 * - EDITORHUB_DESKTOP_QUIET=1     关闭 HTTP trace / API debug 等 server 侧增强日志
 * - EDITORHUB_DESKTOP_LOG_DIR     自定义日志目录
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";

function pad(n, width = 2) {
  return String(n).padStart(width, "0");
}

function createDesktopLogSessionId(date = new Date()) {
  return (
    [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("") +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

function parseByteSize(spec, fallback) {
  const match = /^(\d+(?:\.\d+)?)\s*([BKMG])?$/i.exec(String(spec ?? "").trim());
  if (!match) {
    return fallback;
  }
  const unit = (match[2] || "B").toUpperCase();
  const mult = { B: 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3 };
  return Math.floor(Number.parseFloat(match[1]) * (mult[unit] ?? 1));
}

const LOG_PREFIX = "desktop-op";
const LOG_SESSION_ID =
  process.env.EDITORHUB_DESKTOP_OP_LOG_SESSION_ID || createDesktopLogSessionId();
process.env.EDITORHUB_DESKTOP_OP_LOG_SESSION_ID = LOG_SESSION_ID;
const LOG_BASENAME = `${LOG_PREFIX}-${LOG_SESSION_ID}.log`;
const DEFAULT_ROTATE_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 200 * 1024 * 1024;

let cachedLogDirs = null;
let primaryLogPath = null;
let currentChunkIndex = 0;

function envFlagOff(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized === "0" || normalized === "false" || normalized === "off" || normalized === "no";
}

function envFlagOn(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes";
}

export function isDesktopDebugEnabled() {
  return !envFlagOff(process.env.EDITORHUB_DESKTOP_DEBUG);
}

export function isDesktopDebugCapabilityEnabled() {
  return (
    envFlagOn(process.env.EDITORHUB_DESKTOP_DEBUG) ||
    envFlagOn(process.env.EDITORHUB_DEBUG_ENABLED) ||
    envFlagOn(process.env.DEPLOY_DEBUG)
  );
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
  cachedLogDirs = pathResolver();
  primaryLogPath = cachedLogDirs[0]
    ? path.join(cachedLogDirs[0], LOG_BASENAME)
    : null;
}

function resolveLogDirs() {
  if (cachedLogDirs?.length) {
    return cachedLogDirs;
  }
  const envDir = process.env.EDITORHUB_DESKTOP_LOG_DIR?.trim();
  const candidates = [
    envDir,
    process.env.EXCALIDRAW_LOG_DIR?.trim(),
    process.env.APPDATA && path.join(process.env.APPDATA, "EditorHub", "logs"),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "EditorHub", "logs"),
    process.env.TEMP && path.join(process.env.TEMP, "EditorHub", "logs"),
  ].filter(Boolean);
  cachedLogDirs = [...new Set(candidates)];
  primaryLogPath = cachedLogDirs[0]
    ? path.join(cachedLogDirs[0], LOG_BASENAME)
    : null;
  return cachedLogDirs;
}

export function getDesktopOpLogPath() {
  resolveLogDirs();
  return primaryLogPath;
}

function basenameForChunk(index) {
  return index === 0 ? LOG_BASENAME : `${LOG_BASENAME}.${index}`;
}

function resolveWritePath(logDir) {
  const rotateBytes = parseByteSize(
    process.env.LOG_ROTATE_SIZE ?? "10M",
    DEFAULT_ROTATE_BYTES,
  );
  let candidate = path.join(logDir, basenameForChunk(currentChunkIndex));
  try {
    if (existsSync(candidate) && statSync(candidate).size >= rotateBytes) {
      currentChunkIndex += 1;
      candidate = path.join(logDir, basenameForChunk(currentChunkIndex));
    }
  } catch {
    // keep current candidate
  }
  return candidate;
}

function pruneDesktopOpLogs() {
  const maxTotalBytes = parseByteSize(
    process.env.LOG_MAX_TOTAL_SIZE ?? "200M",
    DEFAULT_MAX_TOTAL_BYTES,
  );
  const pattern = /^desktop-op-\d{8}-\d{6}(?:-\d+)?\.log(?:\.\d+)?$/;
  const protectedNames = new Set([LOG_BASENAME, basenameForChunk(currentChunkIndex)]);
  for (const logDir of resolveLogDirs()) {
    try {
      mkdirSync(logDir, { recursive: true });
      let files = readdirSync(logDir)
        .filter(
          (name) =>
            (pattern.test(name) || name === "desktop-op.log") &&
            !protectedNames.has(name),
        )
        .map((name) => {
          const filePath = path.join(logDir, name);
          const st = statSync(filePath);
          return { filePath, size: st.size, mtime: st.mtimeMs };
        })
        .sort((a, b) => a.mtime - b.mtime);
      let total = files.reduce((sum, file) => sum + file.size, 0);
      try {
        total += statSync(path.join(logDir, LOG_BASENAME)).size;
      } catch {
        // current session may not exist yet
      }
      while (files.length && total > maxTotalBytes) {
        const oldest = files.shift();
        if (!oldest) {
          break;
        }
        try {
          unlinkSync(oldest.filePath);
          total -= oldest.size;
        } catch {
          // ignore races
        }
      }
    } catch {
      // ignore unreadable dirs
    }
  }
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
    pruneDesktopOpLogs();
    for (const logDir of resolveLogDirs()) {
      try {
        mkdirSync(logDir, { recursive: true });
        const logPath = resolveWritePath(logDir);
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
  if (paths.dataDir) {
    process.env.EXCALIDRAW_DATA_DIR = paths.dataDir;
  } else {
    process.env.EXCALIDRAW_DATA_DIR ||= paths.dataDir;
  }
  if (paths.logDir) {
    process.env.EXCALIDRAW_LOG_DIR = paths.logDir;
  } else {
    process.env.EXCALIDRAW_LOG_DIR ||= paths.logDir;
  }
  process.env.EXCALIDRAW_LOG_TO_FILE ||= "1";

  if (isDesktopDebugCapabilityEnabled()) {
    process.env.EDITORHUB_DEBUG_ENABLED ||= "1";
  }

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
    debugAllowed: isDesktopDebugCapabilityEnabled(),
    quiet: isDesktopQuiet(),
  });
}
