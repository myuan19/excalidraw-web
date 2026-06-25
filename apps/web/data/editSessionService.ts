import { FileSyncState } from "./FileSyncState";
import { recordRecentFileAccess } from "./recentFiles";

const SESSION_PREFIX = "editorhub-edit-session-v1-";

type EditSessionRecord = {
  closedCleanly: boolean;
  openedAt: string;
  lastEditedAt?: string;
};

function sessionKey(fileId: string): string {
  return `${SESSION_PREFIX}${fileId}`;
}

function readSession(fileId: string): EditSessionRecord | null {
  try {
    const raw = sessionStorage.getItem(sessionKey(fileId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as EditSessionRecord;
    if (typeof parsed.closedCleanly !== "boolean") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(fileId: string, record: EditSessionRecord): void {
  try {
    sessionStorage.setItem(sessionKey(fileId), JSON.stringify(record));
  } catch {
    // ignore quota
  }
}

export type EditSessionBadge = "interrupted" | "draft" | null;

/** 编辑器打开：标记会话尚未正常结束。 */
export function markEditSessionOpened(fileId: string): void {
  if (!fileId) {
    return;
  }
  writeSession(fileId, {
    closedCleanly: false,
    openedAt: new Date().toISOString(),
  });
}

/** 编辑过程中刷新最近编辑时间。 */
export function markEditSessionEdited(fileId: string): void {
  if (!fileId) {
    return;
  }
  const prev = readSession(fileId);
  writeSession(fileId, {
    closedCleanly: false,
    openedAt: prev?.openedAt ?? new Date().toISOString(),
    lastEditedAt: new Date().toISOString(),
  });
  recordRecentFileAccess(fileId);
}

/** 保存成功或正常离开且已同步。 */
export function markEditSessionClosedCleanly(fileId: string): void {
  if (!fileId) {
    return;
  }
  const prev = readSession(fileId);
  writeSession(fileId, {
    closedCleanly: true,
    openedAt: prev?.openedAt ?? new Date().toISOString(),
    lastEditedAt: prev?.lastEditedAt,
  });
}

export function clearEditSession(fileId: string): void {
  try {
    sessionStorage.removeItem(sessionKey(fileId));
  } catch {
    // ignore
  }
}

export function getEditSessionBadge(fileId: string): EditSessionBadge {
  if (!fileId || !FileSyncState.hasUnsavedChanges(fileId)) {
    return null;
  }
  const session = readSession(fileId);
  if (session && !session.closedCleanly) {
    return "interrupted";
  }
  return "draft";
}
