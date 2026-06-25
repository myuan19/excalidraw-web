import { createLogger } from "../lib/logger";

import { getClientTabId } from "./clientRequestContext";

const log = createLogger({ module: "docVersion" });

export type DocumentVersionAction =
  | "session-set"
  | "session-clear"
  | "session-unchanged"
  | "save-attempt"
  | "save-success"
  | "save-skipped"
  | "save-conflict"
  | "remote-fetch"
  | "remote-apply"
  | "open-init"
  | "hash-list"
  | "cache-meta";

export type DocumentVersionLogPayload = {
  action: DocumentVersionAction;
  fileId: string;
  reason?: string;
  sessionVersion?: number | null;
  previousSessionVersion?: number | null;
  serverVersion?: number | null;
  expectedVersion?: number | null;
  cacheVersion?: number | null;
  forceOverwrite?: boolean;
  skipped?: boolean;
  source?: string | null;
};

function fileId8(fileId: string): string {
  return fileId.length > 8 ? fileId.slice(0, 8) : fileId;
}

export function logDocumentVersion(payload: DocumentVersionLogPayload): void {
  const data: Record<string, unknown> = {
    action: payload.action,
    fileId: fileId8(payload.fileId),
    clientTabId: getClientTabId(),
  };
  if (payload.reason) {
    data.reason = payload.reason;
  }
  if (payload.previousSessionVersion !== undefined) {
    data.previousSessionVersion = payload.previousSessionVersion;
  }
  if (payload.sessionVersion !== undefined) {
    data.sessionVersion = payload.sessionVersion;
  }
  if (payload.serverVersion !== undefined) {
    data.serverVersion = payload.serverVersion;
  }
  if (payload.expectedVersion !== undefined) {
    data.expectedVersion = payload.expectedVersion;
  }
  if (payload.cacheVersion !== undefined) {
    data.cacheVersion = payload.cacheVersion;
  }
  if (payload.forceOverwrite !== undefined) {
    data.forceOverwrite = payload.forceOverwrite;
  }
  if (payload.skipped !== undefined) {
    data.skipped = payload.skipped;
  }
  if (payload.source !== undefined) {
    data.source = payload.source;
  }

  if (payload.action === "save-conflict") {
    log.warn(payload.action, data);
    return;
  }
  if (payload.action === "session-unchanged") {
    log.debug(payload.action, data);
    return;
  }
  log.info(payload.action, data);
}

export type DocumentVersionContext = {
  reason: string;
  serverVersion?: number | null;
  cacheVersion?: number | null;
  expectedVersion?: number | null;
  forceOverwrite?: boolean;
};
