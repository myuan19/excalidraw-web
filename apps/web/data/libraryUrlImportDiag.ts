import { traceIssueDiag } from "../lib/issueDiagTrace";
import { isDebugRuntimeEnabled } from "./debugCapability";

import type { TracePhase } from "../lib/userTrace";

const AREA = "library.url-import" as const;
const CONSOLE_PREFIX = "[lib-url-import]";

/** Debug 包诊断：grep `lib-url-import` 或 `library.url-import` in desktop-op-*.log */
export function logLibraryUrlImport(
  action: string,
  data?: Record<string, unknown>,
  phase: TracePhase = "branch",
): void {
  const payload = { action, phase, ...(data ?? {}) };
  try {
    console.info(CONSOLE_PREFIX, action, payload);
  } catch {
    /* ignore */
  }
  if (isDebugRuntimeEnabled()) {
    traceIssueDiag(AREA, action, data, phase);
  }
}

export function logLibraryUrlImportError(
  action: string,
  error: unknown,
  data?: Record<string, unknown>,
): void {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "unknown";
  const name = error instanceof Error ? error.name : undefined;
  logLibraryUrlImport(
    action,
    {
      ...data,
      errorMessage: message,
      errorName: name,
    },
    "fail",
  );
}
