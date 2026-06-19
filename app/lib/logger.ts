import {
  Logger,
  LEVEL_VALUE,
  formatDebugEvent,
  type LogEntry,
  type LogLevel,
  type LogTransport,
} from "../../lib/logger/core.js";
import {
  getDebugLoggingMode,
  subscribeAppSettings,
  type DebugLoggingMode,
} from "../data/appSettings";
import { getClientLoggerContext } from "../data/clientRequestContext";
import { isDebugAllowed } from "../data/debugCapability";

// ---------------------------------------------------------------------------
// ConsoleTransport — browser devtools
// ---------------------------------------------------------------------------

class ConsoleTransport implements LogTransport {
  write(entry: LogEntry): void {
    const fn =
      entry.level === "critical" || entry.level === "error"
        ? nativeConsole.error
        : entry.level === "warn"
          ? nativeConsole.warn
          : entry.level === "trace" || entry.level === "debug"
            ? nativeConsole.debug
            : nativeConsole.log;
    fn(formatDebugEvent(entry));
  }
}

const nativeConsole = {
  debug:
    typeof console !== "undefined" ? console.debug.bind(console) : () => {},
  log: typeof console !== "undefined" ? console.log.bind(console) : () => {},
  info: typeof console !== "undefined" ? console.info.bind(console) : () => {},
  warn: typeof console !== "undefined" ? console.warn.bind(console) : () => {},
  error:
    typeof console !== "undefined" ? console.error.bind(console) : () => {},
};

// ---------------------------------------------------------------------------
// RemoteTransport — batch POST to /api/logs (all levels sent to server)
// ---------------------------------------------------------------------------

function getSessionId(): string {
  const KEY = "excalidraw-log-sid";
  try {
    let sid = sessionStorage.getItem(KEY);
    if (!sid) {
      sid = crypto.randomUUID?.() ?? String(Date.now());
      sessionStorage.setItem(KEY, sid);
    }
    return sid;
  } catch {
    return String(Date.now());
  }
}

function logsEndpoint(): string {
  const base = (import.meta.env.VITE_APP_API_BASE ?? "").replace(/\/$/, "");
  return base ? `${base}/api/logs` : "/api/logs";
}

class RemoteTransport implements LogTransport {
  private buffer: LogEntry[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sid = getSessionId();

  private readonly BATCH_SIZE = 30;
  private readonly FLUSH_MS = 3000;
  private readonly MAX_BUFFER = 200;

  constructor() {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.flush();
      });
    }
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", () => this.flush());
    }
    subscribeAppSettings(() => {
      if (!isRemoteEnabled()) {
        this.clear();
      }
    });
  }

  write(entry: LogEntry): void {
    if (!isRemoteEnabled() || isEmbedMode) {
      this.clear();
      return;
    }
    entry.sid = this.sid;
    entry.ua = navigator.userAgent.slice(0, 120);
    this.buffer.push(entry);

    while (this.buffer.length > this.MAX_BUFFER) this.buffer.shift();

    if (this.buffer.length >= this.BATCH_SIZE) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.FLUSH_MS);
    }
  }

  flush(): void {
    if (!isRemoteEnabled() || isEmbedMode) {
      this.clear();
      return;
    }
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, this.BATCH_SIZE);
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const payload = JSON.stringify({
      debugMode: true,
      sid: this.sid,
      entries: batch,
    });
    const url = logsEndpoint();

    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          url,
          new Blob([payload], { type: "application/json" }),
        );
      } else {
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      // silent — logging must never break the app
    }

    if (this.buffer.length > 0) {
      this.timer = setTimeout(() => this.flush(), this.FLUSH_MS);
    }
  }

  clear(): void {
    this.buffer = [];
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function getEffectiveDebugLoggingMode(): DebugLoggingMode {
  if (!isDebugAllowed()) {
    return "off";
  }
  return getDebugLoggingMode();
}

function isDebugModeEnabled(): boolean {
  return getEffectiveDebugLoggingMode() !== "off";
}

function isAiDebugModeEnabled(): boolean {
  return getEffectiveDebugLoggingMode() === "ai";
}

function getMinLevel(): LogLevel {
  if (isDebugModeEnabled()) {
    return "debug";
  }
  try {
    const ls = localStorage.getItem("excalidraw-log-level") as LogLevel | null;
    if (ls && ls in LEVEL_VALUE) return ls;
  } catch {
    /* no localStorage */
  }
  const env = import.meta.env;
  if (env.VITE_LOG_LEVEL && env.VITE_LOG_LEVEL in LEVEL_VALUE) {
    return env.VITE_LOG_LEVEL as LogLevel;
  }
  if (env.DEV) {
    return "info";
  }
  return "error";
}

function isRemoteEnabled(): boolean {
  try {
    if (localStorage.getItem("excalidraw-log-remote") === "0") return false;
  } catch {
    /* no localStorage */
  }
  const env = import.meta.env;
  if (env.VITE_LOG_REMOTE === "0") {
    return false;
  }
  return isAiDebugModeEnabled();
}

const isEmbedMode =
  typeof window !== "undefined" &&
  window.__EXCALIDRAW_EMBED_MODE__ === true;

const remoteTransport = new RemoteTransport();
const transports: LogTransport[] = [new ConsoleTransport(), remoteTransport];

function serializeConsoleArg(arg: unknown): unknown {
  if (arg instanceof Error) {
    return {
      name: arg.name,
      message: arg.message,
      stack: arg.stack?.split("\n").slice(0, 5).join("\n"),
    };
  }
  if (typeof arg === "function") {
    return `[function ${arg.name || "anonymous"}]`;
  }
  return arg;
}

let consoleCaptureInstalled = false;

function installDebugConsoleCapture(): void {
  if (consoleCaptureInstalled || typeof window === "undefined") {
    return;
  }
  consoleCaptureInstalled = true;
  const methods: Array<"debug" | "log" | "info" | "warn" | "error"> = [
    "debug",
    "log",
    "info",
    "warn",
    "error",
  ];
  for (const method of methods) {
    console[method] = (...args: unknown[]) => {
      nativeConsole[method](...args);
      if (!isRemoteEnabled() || isEmbedMode) {
        return;
      }
      const level: LogLevel =
        method === "error" ? "error" : method === "warn" ? "warn" : "debug";
      remoteTransport.write({
        ts: new Date().toISOString(),
        level,
        source: "client",
        module: "console",
        msg:
          typeof args[0] === "string"
            ? args[0].slice(0, 400)
            : `[console.${method}]`,
        data:
          args.length > 1 || typeof args[0] !== "string"
            ? { args: args.map(serializeConsoleArg) }
            : undefined,
      });
    };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createLogger(opts: {
  module: string;
  minLevel?: LogLevel | (() => LogLevel);
}): Logger {
  return new Logger({
    module: opts.module,
    source: "client",
    context: getClientLoggerContext,
    minLevel: opts.minLevel ?? (getMinLevel as unknown as LogLevel),
    transports,
  });
}

/**
 * Register global error handlers — call once at app startup.
 */
export function initGlobalErrorCapture(): void {
  if (typeof window === "undefined") return;

  installDebugConsoleCapture();
  const log = createLogger({ module: "global" });

  window.addEventListener("error", (ev) => {
    log.error("uncaught error", {
      message: typeof ev.message === "string" ? ev.message : "script error",
      filename: ev.filename ?? undefined,
      lineno: ev.lineno ?? undefined,
      colno: ev.colno ?? undefined,
      stack: ev.error?.stack?.split("\n").slice(0, 5).join("\n"),
    });
  });

  window.addEventListener("unhandledrejection", (ev) => {
    const reason = ev.reason;
    log.error("unhandled promise rejection", {
      message: reason instanceof Error ? reason.message : String(reason),
      stack:
        reason instanceof Error
          ? reason.stack?.split("\n").slice(0, 5).join("\n")
          : undefined,
    });
  });

  log.info("logger initialized");
}

function argsToData(args: unknown[]): Record<string, unknown> | undefined {
  if (args.length === 0) return undefined;
  if (
    args.length === 1 &&
    args[0] &&
    typeof args[0] === "object" &&
    !Array.isArray(args[0])
  ) {
    return args[0] as Record<string, unknown>;
  }
  return { args };
}

/** FileList open-trace: localStorage `excalidraw-web-debug-filelist-open` or global `excalidraw-web-debug`. */
export function isFileListOpenTraceEnabled(): boolean {
  try {
    if (localStorage.getItem("excalidraw-web-debug-filelist-open") === "0")
      return false;
    if (localStorage.getItem("excalidraw-web-debug") === "1") return true;
    return localStorage.getItem("excalidraw-web-debug-filelist-open") === "1";
  } catch {
    return false;
  }
}

const _fileListOpenLog = createLogger({ module: "fileList.open" });

/** Verbose file-list open / hash routing — gated by `isFileListOpenTraceEnabled()`. */
export function logFileListOpen(msg: string, ...args: unknown[]): void {
  if (!isFileListOpenTraceEnabled()) return;
  _fileListOpenLog.debug(msg, argsToData(args));
}

export type { LogEntry, LogLevel, LogTransport } from "../../lib/logger/core.js";
