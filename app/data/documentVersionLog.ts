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
  | "conflict-keep-local"
  | "conflict-load-remote"
  | "remote-fetch"
  | "remote-apply"
  | "open-init"
  | "hash-list"
  | "cache-meta"
  | "server-increment"
  | "server-conflict"
  | "server-restore";

export type DocumentVersionLogPayload = {
  action: DocumentVersionAction;
  fileId: string;
  reason?: string;
  /** 当前页面会话基线版本（tab base version） */
  sessionVersion?: number | null;
  previousSessionVersion?: number | null;
  /** 服务端递增前的版本（server 侧日志） */
  previousVersion?: number | null;
  /** 服务器当前/返回版本 */
  serverVersion?: number | null;
  /** PUT 时发送的 expectedVersion */
  expectedVersion?: number | null;
  /** 本地 cache meta 里记录的服务器版本 */
  cacheVersion?: number | null;
  forceOverwrite?: boolean;
  skipped?: boolean;
  nextVersion?: number | null;
  source?: string | null;
};

function fileId8(fileId: string): string {
  return fileId.length > 8 ? fileId.slice(0, 8) : fileId;
}

/** 所有文档版本相关日志的统一出口（module: docVersion）。 */
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
  if (payload.previousVersion !== undefined) {
    data.previousVersion = payload.previousVersion;
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
  if (payload.nextVersion !== undefined) {
    data.nextVersion = payload.nextVersion;
  }
  if (payload.forceOverwrite !== undefined) {
    data.forceOverwrite = payload.forceOverwrite;
  }
  if (payload.skipped !== undefined) {
    data.skipped = payload.skipped;
  }
  if (payload.source !== undefined) {
    data.clientSource = payload.source;
  }

  if (
    payload.action === "save-conflict" ||
    payload.action === "server-conflict"
  ) {
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
