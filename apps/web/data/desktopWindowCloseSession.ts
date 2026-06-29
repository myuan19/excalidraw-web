/**
 * 桌面关窗准备阶段的运行态：跟踪每个待保存 tab 是否已结束（非 pending），
 * 全部 settled 后再允许关窗。不依赖固定超时。
 */

export type DesktopCloseSaveState = "pending" | "done" | "failed" | "skipped";

export type DesktopCloseSaveEntry = {
  fileId: string;
  kind?: string;
  state: DesktopCloseSaveState;
  ok?: boolean;
};

export type DesktopWindowClosePhase =
  | "idle"
  | "saving"
  | "persisting"
  | "ready";

export type DesktopWindowCloseSession = {
  id: number;
  phase: DesktopWindowClosePhase;
  startedAt: number;
  entries: Map<string, DesktopCloseSaveEntry>;
};

export type DesktopWindowCloseSnapshot = {
  id: number;
  phase: DesktopWindowClosePhase;
  ready: boolean;
  pendingCount: number;
  doneCount: number;
  failedCount: number;
  skippedCount: number;
  fileIds8: string[];
};

let sessionCounter = 0;
let activeSession: DesktopWindowCloseSession | null = null;
const settleWaiters = new Set<(session: DesktopWindowCloseSession) => void>();

export function getDesktopWindowCloseSession(): DesktopWindowCloseSession | null {
  return activeSession;
}

export function snapshotDesktopWindowCloseSession(): DesktopWindowCloseSnapshot | null {
  if (!activeSession) {
    return null;
  }
  const entries = [...activeSession.entries.values()];
  const pendingCount = entries.filter((e) => e.state === "pending").length;
  const doneCount = entries.filter((e) => e.state === "done").length;
  const failedCount = entries.filter((e) => e.state === "failed").length;
  const skippedCount = entries.filter((e) => e.state === "skipped").length;
  const savesSettled = pendingCount === 0;
  return {
    id: activeSession.id,
    phase: activeSession.phase,
    ready: savesSettled && activeSession.phase === "ready",
    pendingCount,
    doneCount,
    failedCount,
    skippedCount,
    fileIds8: entries.map((e) => e.fileId.slice(0, 8)),
  };
}

export function areDesktopCloseSavesSettled(
  session: DesktopWindowCloseSession,
): boolean {
  if (session.entries.size === 0) {
    return true;
  }
  return [...session.entries.values()].every((entry) => entry.state !== "pending");
}

export function beginDesktopWindowCloseSession(
  tabs: ReadonlyArray<{ fileId: string; kind?: string; dirty: boolean }>,
): DesktopWindowCloseSession {
  sessionCounter += 1;
  const entries = new Map<string, DesktopCloseSaveEntry>();
  for (const tab of tabs) {
    entries.set(tab.fileId, {
      fileId: tab.fileId,
      kind: tab.kind,
      state: tab.dirty ? "pending" : "skipped",
      ok: tab.dirty ? undefined : true,
    });
  }
  activeSession = {
    id: sessionCounter,
    phase: "saving",
    startedAt: performance.now(),
    entries,
  };
  return activeSession;
}

export function markDesktopCloseSaveSettled(
  fileId: string,
  ok: boolean,
): void {
  if (!activeSession) {
    return;
  }
  const entry = activeSession.entries.get(fileId);
  if (!entry || entry.state !== "pending") {
    return;
  }
  entry.state = ok ? "done" : "failed";
  entry.ok = ok;
  notifyDesktopCloseSaveWaiters();
}

export function setDesktopWindowClosePhase(
  phase: DesktopWindowClosePhase,
): void {
  if (!activeSession) {
    return;
  }
  activeSession.phase = phase;
  notifyDesktopCloseSaveWaiters();
}

export function finishDesktopWindowCloseSession(): void {
  if (!activeSession) {
    return;
  }
  activeSession.phase = "ready";
  notifyDesktopCloseSaveWaiters();
  activeSession = null;
  settleWaiters.clear();
}

export function waitForDesktopCloseSavesSettled(
  sessionId: number,
): Promise<DesktopWindowCloseSession> {
  const session = activeSession;
  if (!session || session.id !== sessionId) {
    return Promise.reject(new Error("desktop-close-session-missing"));
  }
  if (areDesktopCloseSavesSettled(session)) {
    return Promise.resolve(session);
  }
  return new Promise((resolve, reject) => {
    const waiter = (current: DesktopWindowCloseSession) => {
      if (current.id !== sessionId) {
        return;
      }
      if (areDesktopCloseSavesSettled(current)) {
        settleWaiters.delete(waiter);
        resolve(current);
      }
    };
    settleWaiters.add(waiter);
    if (!activeSession || activeSession.id !== sessionId) {
      settleWaiters.delete(waiter);
      reject(new Error("desktop-close-session-missing"));
    }
  });
}

function notifyDesktopCloseSaveWaiters(): void {
  if (!activeSession || !areDesktopCloseSavesSettled(activeSession)) {
    return;
  }
  for (const waiter of settleWaiters) {
    waiter(activeSession);
  }
}

/** DevTools / 诊断：读取当前关窗准备态 */
export function installDesktopWindowCloseStateProbe(): void {
  if (typeof window === "undefined") {
    return;
  }
  (
    window as Window & {
      __EDITORHUB_DESKTOP_CLOSE_STATE__?: () => DesktopWindowCloseSnapshot | null;
    }
  ).__EDITORHUB_DESKTOP_CLOSE_STATE__ = snapshotDesktopWindowCloseSession;
}
