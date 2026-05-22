import {
  Logger,
  LEVEL_VALUE,
  type LogEntry,
  type LogLevel,
  type LogTransport,
} from "../../lib/logger/core.js";

// ---------------------------------------------------------------------------
// ConsoleTransport — browser devtools
// ---------------------------------------------------------------------------

class ConsoleTransport implements LogTransport {
  write(entry: LogEntry): void {
    const fn =
      entry.level === "error"
        ? console.error
        : entry.level === "warn"
          ? console.warn
          : console.log;
    const prefix = `[${entry.module}]`;
    if (entry.data) {
      fn(prefix, entry.msg, entry.data);
    } else {
      fn(prefix, entry.msg);
    }
  }
}

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
  }

  write(entry: LogEntry): void {
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
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, this.BATCH_SIZE);
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const payload = JSON.stringify({ entries: batch });
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
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function getMinLevel(): LogLevel {
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
  return env.DEV ? "debug" : "info";
}

function isRemoteEnabled(): boolean {
  try {
    if (localStorage.getItem("excalidraw-log-remote") === "0") return false;
  } catch {
    /* no localStorage */
  }
  const env = import.meta.env;
  return env.VITE_LOG_REMOTE !== "0";
}

const isEmbedMode =
  typeof window !== "undefined" &&
  window.__EXCALIDRAW_EMBED_MODE__ === true;

const transports: LogTransport[] = [new ConsoleTransport()];
if (isRemoteEnabled() && !isEmbedMode) {
  transports.push(new RemoteTransport());
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createLogger(opts: { module: string }): Logger {
  return new Logger({
    module: opts.module,
    source: "client",
    minLevel: getMinLevel(),
    transports,
  });
}

/**
 * Register global error handlers — call once at app startup.
 */
export function initGlobalErrorCapture(): void {
  if (typeof window === "undefined") return;

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
