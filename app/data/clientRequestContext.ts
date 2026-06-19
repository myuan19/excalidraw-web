import { isDebugRuntimeEnabled } from "./debugCapability";

const TAB_ID_STORAGE_KEY = "editorhub-tab-id";
const RUN_ID_STORAGE_KEY = "editorhub-run-id";
const TRACE_ID_STORAGE_KEY = "editorhub-trace-id";
const CASE_ID_STORAGE_KEY = "editorhub-debug-case-id";

let requestSeq = 0;
let memoryTabId: string | null = null;
let memoryRunId: string | null = null;
let memoryTraceId: string | null = null;

function createContextId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

function getSessionContextId(
  key: string,
  prefix: string,
  memoryValue: string | null,
  setMemoryValue: (value: string) => void,
): string {
  if (memoryValue) {
    return memoryValue;
  }
  try {
    const stored = sessionStorage.getItem(key);
    if (stored) {
      setMemoryValue(stored);
      return stored;
    }
    const next = createContextId(prefix);
    sessionStorage.setItem(key, next);
    setMemoryValue(next);
    return next;
  } catch {
    const next = memoryValue ?? createContextId(prefix);
    setMemoryValue(next);
    return next;
  }
}

export function getClientTabId(): string {
  return getSessionContextId(TAB_ID_STORAGE_KEY, "tab", memoryTabId, (value) => {
    memoryTabId = value;
  });
}

export function getClientRunId(): string {
  return getSessionContextId(RUN_ID_STORAGE_KEY, "run", memoryRunId, (value) => {
    memoryRunId = value;
  });
}

export function getClientTraceId(): string {
  return getSessionContextId(
    TRACE_ID_STORAGE_KEY,
    "trace",
    memoryTraceId,
    (value) => {
      memoryTraceId = value;
    },
  );
}

export function getClientCaseId(): string | null {
  try {
    const stored = sessionStorage.getItem(CASE_ID_STORAGE_KEY);
    return stored && stored.trim() ? stored.trim() : null;
  } catch {
    return null;
  }
}

export function getClientLoggerContext(): Record<string, string> {
  if (!isDebugRuntimeEnabled()) {
    return {};
  }
  return {
    run: getClientRunId(),
    trace: getClientTraceId(),
    tab: getClientTabId(),
    ...(getClientCaseId() ? { case: getClientCaseId() as string } : {}),
  };
}

export function buildClientRequestHeaders(
  source?: string | null,
): Record<string, string> {
  if (!isDebugRuntimeEnabled()) {
    return {};
  }
  requestSeq += 1;
  const requestId = `req-${requestSeq}`;
  const caseId = getClientCaseId();
  return {
    "X-EditorHub-Run-Id": getClientRunId(),
    "X-EditorHub-Trace-Id": getClientTraceId(),
    "X-EditorHub-Request-Id": requestId,
    "X-EditorHub-Tab-Id": getClientTabId(),
    "X-EditorHub-Request-Seq": String(requestSeq),
    "X-EditorHub-Client-Time": new Date().toISOString(),
    ...(caseId ? { "X-EditorHub-Case-Id": caseId } : {}),
    ...(source ? { "X-EditorHub-Source": source } : {}),
  };
}
