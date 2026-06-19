import { createLogger } from "../lib/logger";

import type { SaveToServerSource } from "../hooks/types";

const log = createLogger({ module: "fileSyncOperation" });

export type RemoteUpdateTarget = {
  fileId: string;
  contentSha256?: string | null;
  serverVersion?: number | null;
  source: "cross-tab" | "save-conflict";
};

type OperationKind = "remote-update-prompt" | "remote-apply";

type OperationToken = {
  id: number;
  fileId: string;
  kind: OperationKind;
};

type FileOperationState = {
  promptDepth: number;
  applyDepth: number;
  target: RemoteUpdateTarget | null;
  pendingTarget: RemoteUpdateTarget | null;
};

const states = new Map<string, FileOperationState>();
const tokens = new Map<number, OperationToken>();
let tokenSeq = 0;

const PASSIVE_SAVE_SOURCES = new Set<SaveToServerSource>([
  "auto",
  "visibility",
  "thumbnail",
]);

const DEFAULT_REMOTE_APPLY_SETTLE_MS = 900;
const DEFAULT_REMOTE_APPLY_SETTLE_FRAMES = 2;

function fileId8(fileId: string | null | undefined): string | null {
  return fileId ? fileId.slice(0, 8) : null;
}

function sha8(sha: string | null | undefined): string | null {
  return sha ? sha.slice(0, 8) : null;
}

function getOrCreateState(fileId: string): FileOperationState {
  let state = states.get(fileId);
  if (!state) {
    state = {
      promptDepth: 0,
      applyDepth: 0,
      target: null,
      pendingTarget: null,
    };
    states.set(fileId, state);
  }
  return state;
}

function pruneState(fileId: string, state: FileOperationState): void {
  if (
    state.promptDepth <= 0 &&
    state.applyDepth <= 0 &&
    !state.target &&
    !state.pendingTarget
  ) {
    states.delete(fileId);
  }
}

function beginOperation(
  fileId: string,
  kind: OperationKind,
  target?: RemoteUpdateTarget | null,
): OperationToken {
  const token: OperationToken = {
    id: ++tokenSeq,
    fileId,
    kind,
  };
  const state = getOrCreateState(fileId);
  if (kind === "remote-update-prompt") {
    state.promptDepth += 1;
    state.target = target ?? state.target;
  } else {
    state.applyDepth += 1;
  }
  tokens.set(token.id, token);
  log.event(
    "info",
    `sync.operation.${kind}.begin`,
    "file sync operation begin",
    {
      fields: {
        fileId8: fileId8(fileId),
        tokenId: token.id,
        promptDepth: state.promptDepth,
        applyDepth: state.applyDepth,
        targetSha8: sha8(state.target?.contentSha256),
        targetVersion: state.target?.serverVersion ?? null,
        targetSource: state.target?.source ?? null,
        pendingTargetSha8: sha8(state.pendingTarget?.contentSha256),
        pendingTargetVersion: state.pendingTarget?.serverVersion ?? null,
      },
    },
  );
  return token;
}

function endOperation(token: OperationToken): void {
  const active = tokens.get(token.id);
  if (!active) {
    return;
  }
  tokens.delete(token.id);
  const state = states.get(active.fileId);
  if (!state) {
    return;
  }
  if (active.kind === "remote-update-prompt") {
    state.promptDepth = Math.max(0, state.promptDepth - 1);
    if (state.promptDepth === 0) {
      state.target = null;
    }
  } else {
    state.applyDepth = Math.max(0, state.applyDepth - 1);
  }
  log.event(
    "info",
    `sync.operation.${active.kind}.end`,
    "file sync operation end",
    {
      fields: {
        fileId8: fileId8(active.fileId),
        tokenId: active.id,
        promptDepth: state.promptDepth,
        applyDepth: state.applyDepth,
        targetSha8: sha8(state.target?.contentSha256),
        targetVersion: state.target?.serverVersion ?? null,
        pendingTargetSha8: sha8(state.pendingTarget?.contentSha256),
        pendingTargetVersion: state.pendingTarget?.serverVersion ?? null,
      },
    },
  );
  pruneState(active.fileId, state);
}

function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 16);
  });
}

async function waitForRemoteApplySettle(
  fileId: string,
  opts?: { settleMs?: number; settleFrames?: number },
): Promise<void> {
  const settleFrames = opts?.settleFrames ?? DEFAULT_REMOTE_APPLY_SETTLE_FRAMES;
  const settleMs = opts?.settleMs ?? DEFAULT_REMOTE_APPLY_SETTLE_MS;
  log.event(
    "info",
    "sync.operation.remote-apply.settle.begin",
    "remote apply settle begin",
    {
      fields: {
        fileId8: fileId8(fileId),
        settleFrames,
        settleMs,
      },
    },
  );
  for (let i = 0; i < settleFrames; i += 1) {
    await waitForAnimationFrame();
  }
  if (settleMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, settleMs));
  }
  log.event(
    "info",
    "sync.operation.remote-apply.settle.end",
    "remote apply settle end",
    {
      fields: {
        fileId8: fileId8(fileId),
        settleFrames,
        settleMs,
      },
    },
  );
}

export function beginRemoteUpdatePrompt(
  target: RemoteUpdateTarget,
): OperationToken {
  return beginOperation(target.fileId, "remote-update-prompt", target);
}

export function endRemoteUpdatePrompt(token: OperationToken): void {
  endOperation(token);
}

export async function runRemoteFileApply<T>(
  fileId: string,
  apply: () => Promise<T>,
  opts?: { settleMs?: number; settleFrames?: number },
): Promise<T> {
  const token = beginOperation(fileId, "remote-apply");
  try {
    const result = await apply();
    await waitForRemoteApplySettle(fileId, opts);
    return result;
  } finally {
    endOperation(token);
  }
}

export function isPassiveSaveSource(source: SaveToServerSource): boolean {
  return PASSIVE_SAVE_SOURCES.has(source);
}

export function isPassiveSaveBlocked(
  fileId: string | null | undefined,
): boolean {
  if (!fileId) {
    return false;
  }
  const state = states.get(fileId);
  return !!state && (state.promptDepth > 0 || state.applyDepth > 0);
}

export function isRemoteApplyInProgress(
  fileId: string | null | undefined,
): boolean {
  if (!fileId) {
    return false;
  }
  return (states.get(fileId)?.applyDepth ?? 0) > 0;
}

export function isRemoteMutationSuppressed(
  fileId: string | null | undefined,
): boolean {
  return isRemoteApplyInProgress(fileId);
}

export function getPendingRemoteUpdateTarget(
  fileId: string | null | undefined,
): RemoteUpdateTarget | null {
  if (!fileId) {
    return null;
  }
  return states.get(fileId)?.target ?? null;
}

export function queueRemoteUpdateTarget(target: RemoteUpdateTarget): void {
  const state = getOrCreateState(target.fileId);
  state.pendingTarget = target;
  log.event(
    "info",
    "sync.operation.remote-target.queued",
    "remote update target queued",
    {
      fields: {
        fileId8: fileId8(target.fileId),
        targetSha8: sha8(target.contentSha256),
        targetVersion: target.serverVersion ?? null,
        targetSource: target.source,
      },
    },
  );
}

export function peekQueuedRemoteUpdateTarget(
  fileId: string | null | undefined,
): RemoteUpdateTarget | null {
  if (!fileId) {
    return null;
  }
  return states.get(fileId)?.pendingTarget ?? null;
}

export function consumeQueuedRemoteUpdateTarget(
  fileId: string | null | undefined,
): RemoteUpdateTarget | null {
  if (!fileId) {
    return null;
  }
  const state = states.get(fileId);
  if (!state?.pendingTarget) {
    return null;
  }
  const target = state.pendingTarget;
  state.pendingTarget = null;
  log.event(
    "info",
    "sync.operation.remote-target.consumed",
    "remote update target consumed",
    {
      fields: {
        fileId8: fileId8(fileId),
        targetSha8: sha8(target.contentSha256),
        targetVersion: target.serverVersion ?? null,
        targetSource: target.source,
      },
    },
  );
  pruneState(fileId, state);
  return target;
}

export function shouldBlockPassiveSave(
  fileId: string | null | undefined,
  source: SaveToServerSource,
): boolean {
  return isPassiveSaveSource(source) && isPassiveSaveBlocked(fileId);
}

export function isRemoteUpdateTargetSatisfied(
  target: RemoteUpdateTarget | null | undefined,
  actual: { contentSha256?: string | null; version?: number | null },
): boolean {
  if (!target) {
    return true;
  }
  if (target.contentSha256 && target.contentSha256 !== actual.contentSha256) {
    return false;
  }
  if (
    typeof target.serverVersion === "number" &&
    target.serverVersion !== actual.version
  ) {
    return false;
  }
  return true;
}
