export type ClientLogLevel = "info" | "warn" | "error";

export interface ClientLogEntry {
  level: ClientLogLevel;
  msg: string;
  data?: unknown;
}

type Fetcher = typeof fetch;
type LoggerTarget = Pick<EventTarget, "addEventListener">;

let installedTargets = new WeakSet<LoggerTarget>();

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { value: String(error) };
}

export async function postClientLog(
  entry: ClientLogEntry,
  fetcher: Fetcher = fetch,
): Promise<void> {
  try {
    await fetcher("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: [entry] }),
      keepalive: true,
    });
  } catch {
    // Client logging must never affect editor behavior.
  }
}

export function installClientLogger({
  target = window,
  fetcher = fetch,
}: {
  target?: LoggerTarget;
  fetcher?: Fetcher;
} = {}) {
  if (installedTargets.has(target)) return;
  installedTargets.add(target);

  target.addEventListener("error", (event) => {
    const errorEvent = event as ErrorEvent;
    void postClientLog({
      level: "error",
      msg: errorEvent.message || "window error",
      data: serializeError(errorEvent.error ?? errorEvent.message),
    }, fetcher);
  });

  target.addEventListener("unhandledrejection", (event) => {
    const rejectionEvent = event as PromiseRejectionEvent;
    void postClientLog({
      level: "error",
      msg: "unhandled promise rejection",
      data: serializeError(rejectionEvent.reason),
    }, fetcher);
  });
}

export function resetClientLoggerForTests() {
  installedTargets = new WeakSet<LoggerTarget>();
}
