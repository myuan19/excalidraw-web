type PerfFields = Record<string, unknown>;

type PerfEntry = {
  ts: string;
  level: "info" | "warn" | "error";
  source: "client";
  module: "perf";
  event: string;
  msg: string;
  fields?: PerfFields;
};

const PERF_LOG_STORAGE_KEY = "editorhub-perf-log-remote";
const PERF_SESSION_KEY = "editorhub-perf-log-sid";
const BATCH_SIZE = 12;
const FLUSH_MS = 1000;
const MAX_BUFFER = 80;

let buffer: PerfEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let listenersInstalled = false;

function isPerfLogEnabled(): boolean {
  try {
    if (localStorage.getItem(PERF_LOG_STORAGE_KEY) === "0") {
      return false;
    }
  } catch {
    // ignore storage failures
  }
  return import.meta.env.VITE_PERF_LOG_REMOTE !== "0";
}

function getPerfSessionId(): string {
  try {
    let sid = sessionStorage.getItem(PERF_SESSION_KEY);
    if (!sid) {
      sid = crypto.randomUUID?.() ?? String(Date.now());
      sessionStorage.setItem(PERF_SESSION_KEY, sid);
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

function sanitizePerfField(value: unknown): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "string") {
    return value.length > 240 ? `${value.slice(0, 240)}...(len=${value.length})` : value;
  }
  try {
    const text = JSON.stringify(value);
    return text.length > 240 ? `${text.slice(0, 240)}...(len=${text.length})` : text;
  } catch {
    return "[unserializable]";
  }
}

function sanitizePerfFields(fields?: PerfFields): PerfFields | undefined {
  if (!fields) {
    return undefined;
  }
  const out: PerfFields = {};
  for (const [key, value] of Object.entries(fields).slice(0, 40)) {
    out[key] = sanitizePerfField(value);
  }
  return out;
}

function installFlushListeners(): void {
  if (listenersInstalled || typeof window === "undefined") {
    return;
  }
  listenersInstalled = true;
  window.addEventListener("pagehide", flushPerfLogs);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      flushPerfLogs();
    }
  });
}

export function markPerfNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function perfDurationMs(startedAt: number): number {
  return Math.round(markPerfNow() - startedAt);
}

export function logPerf(
  event: string,
  fields?: PerfFields,
  level: "info" | "warn" | "error" = "info",
): void {
  if (!isPerfLogEnabled() || typeof navigator === "undefined") {
    return;
  }
  installFlushListeners();
  const normalizedEvent = event.startsWith("perf.") ? event : `perf.${event}`;
  buffer.push({
    ts: new Date().toISOString(),
    level,
    source: "client",
    module: "perf",
    event: normalizedEvent,
    msg: normalizedEvent,
    fields: sanitizePerfFields(fields),
  });
  while (buffer.length > MAX_BUFFER) {
    buffer.shift();
  }
  if (buffer.length >= BATCH_SIZE) {
    flushPerfLogs();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flushPerfLogs, FLUSH_MS);
  }
}

export function flushPerfLogs(): void {
  if (!isPerfLogEnabled() || buffer.length === 0) {
    return;
  }
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const batch = buffer.splice(0, BATCH_SIZE);
  const payload = JSON.stringify({
    perf: true,
    sid: getPerfSessionId(),
    entries: batch,
  });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        logsEndpoint(),
        new Blob([payload], { type: "application/json" }),
      );
    } else {
      void fetch(logsEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // logging must never affect editor behavior
  }
  if (buffer.length > 0 && !flushTimer) {
    flushTimer = setTimeout(flushPerfLogs, FLUSH_MS);
  }
}
