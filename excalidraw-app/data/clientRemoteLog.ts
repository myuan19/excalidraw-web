/**
 * 默认将诊断行 POST 至 /api/client-logs（服务端默认可收）。
 * 关闭：localStorage.setItem("excalidraw-web-remote-log", "0") 后刷新；
 * 或构建时 VITE_APP_CLIENT_LOG_TO_SERVER=0。
 */
/* eslint-disable no-console -- deliberate */

const STORAGE = "excalidraw-web-remote-log";
const SID_KEY = "excalidraw-web-log-sid";

export function getLogContext(): {
  sid: string;
  path: string;
  build: string;
  visibility: string;
} {
  let sid = "";
  try {
    sid = sessionStorage.getItem(SID_KEY) ?? "";
    if (!sid && typeof crypto !== "undefined" && "randomUUID" in crypto) {
      sid = crypto.randomUUID();
      sessionStorage.setItem(SID_KEY, sid);
    }
  } catch {
    sid = "";
  }
  const env = import.meta.env as { readonly VITE_APP_GIT_SHA?: string };
  const sha =
    typeof env.VITE_APP_GIT_SHA === "string" && env.VITE_APP_GIT_SHA
      ? env.VITE_APP_GIT_SHA
      : "";
  const build = sha ? `sha:${sha.slice(0, 8)}` : import.meta.env.MODE;
  return {
    sid,
    path:
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search || ""}`
        : "",
    build,
    visibility:
      typeof document !== "undefined" ? document.visibilityState : "unknown",
  };
}

export function isRemoteLogEnabled(): boolean {
  try {
    if (import.meta.env.VITE_APP_CLIENT_LOG_TO_SERVER === "0") {
      return false;
    }
    if (
      typeof localStorage !== "undefined" &&
      localStorage.getItem(STORAGE) === "0"
    ) {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

type Entry = {
  ts: string;
  level: string;
  channel: string;
  message: string;
  args?: unknown[];
  userAgent?: string;
  href?: string;
  context?: ReturnType<typeof getLogContext>;
};

const queue: Entry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let disabledByServer = false;

const MAX_QUEUE = 300;
const FLUSH_MS = 2500;
const BATCH = 50;

function clientLogsUrl(): string {
  const base = (import.meta.env.VITE_APP_API_BASE ?? "").replace(/\/$/, "");
  if (!base) {
    return "/api/client-logs";
  }
  return `${base}/api/client-logs`;
}

function scheduleFlush() {
  if (disabledByServer || queue.length === 0 || flushTimer != null) {
    return;
  }
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
    if (queue.length > 0) {
      scheduleFlush();
    }
  }, FLUSH_MS);
}

async function flush() {
  if (disabledByServer || queue.length === 0) {
    return;
  }
  const batch = queue.splice(0, BATCH);
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : undefined;
  const href = typeof window !== "undefined" ? window.location.href : undefined;

  try {
    const res = await fetch(clientLogsUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: batch.map((e) => ({
          ...e,
          userAgent: e.userAgent ?? ua,
          href: e.href ?? href,
          context: e.context ?? getLogContext(),
        })),
      }),
      credentials: "same-origin",
    });

    if (res.status === 404) {
      try {
        const j = /** @type {{ error?: string }} */ await res.json();
        if (j?.error === "client_log_disabled") {
          disabledByServer = true;
          queue.length = 0;
        }
      } catch {
        // ignore
      }
      return;
    }

    if (!res.ok && res.status !== 204) {
      queue.unshift(...batch);
    }
  } catch {
    queue.unshift(...batch);
    while (queue.length > MAX_QUEUE) {
      queue.splice(0, Math.floor(MAX_QUEUE / 2));
    }
  }
}

export function enqueueRemoteLog(parts: {
  channel: string;
  message: string;
  args?: unknown[];
  level?: string;
}): void {
  if (!isRemoteLogEnabled() || disabledByServer) {
    return;
  }

  queue.push({
    ts: new Date().toISOString(),
    level: parts.level ?? "info",
    channel: parts.channel,
    message: parts.message,
    args: parts.args,
    context: getLogContext(),
  });

  while (queue.length > MAX_QUEUE) {
    queue.shift();
  }
  scheduleFlush();
}

function stringifyReason(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.stack ?? reason.message;
  }
  try {
    return typeof reason === "string" ? reason : JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

/**
 * window 级错误上报；需在 debugLog 之外的入口调用一次。
 */
export function initClientRemoteLog(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.addEventListener("pagehide", () => {
    if (!isRemoteLogEnabled() || disabledByServer || queue.length === 0) {
      return;
    }
    const snap = queue.splice(0, BATCH);
    const payload = JSON.stringify({
      entries: snap.map((e) => ({
        ...e,
        userAgent: navigator.userAgent,
        href: window.location.href,
        context: e.context ?? getLogContext(),
      })),
    });
    try {
      navigator.sendBeacon(
        clientLogsUrl(),
        new Blob([payload], { type: "application/json" }),
      );
    } catch {
      //
    }
  });

  window.addEventListener("error", (ev) => {
    if (!isRemoteLogEnabled() || disabledByServer) {
      return;
    }
    const err = ev.error;
    enqueueRemoteLog({
      channel: "[window:error]",
      level: "error",
      message:
        typeof ev.message === "string" && ev.message
          ? ev.message
          : "script error",
      args:
        err != null && typeof err === "object"
          ? [stringifyReason(err), ev.filename, ev.lineno, ev.colno].filter(
              (x, i) => i === 0 || x != null,
            )
          : [ev.filename, ev.lineno, ev.colno].filter(Boolean),
    });
  });

  window.addEventListener("unhandledrejection", (ev: PromiseRejectionEvent) => {
    if (!isRemoteLogEnabled() || disabledByServer) {
      return;
    }
    enqueueRemoteLog({
      channel: "[window:rejection]",
      level: "error",
      message: "unhandledrejection",
      args: [stringifyReason(ev.reason)],
    });
  });

  enqueueRemoteLog({
    channel: "[boot]",
    message: "client remote log initialized",
    args: [{ online: navigator.onLine }],
  });
}
