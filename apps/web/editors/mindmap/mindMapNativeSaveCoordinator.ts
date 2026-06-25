import { debugMindMapBridge, warnMindMapBridge } from "./mindMapBridgeDebug";
import {
  parseMindMapSaveProgress,
  type MindMapSaveProgressPayload,
} from "./mindMapBridgeProtocol";

export const MINDMAP_SAVE_INACTIVITY_TIMEOUT_MS = 15_000;
export const MINDMAP_SAVE_ABSOLUTE_TIMEOUT_MS = 60_000;

export type MindMapNativeSaveBridgeContext = {
  bridgeReady: boolean;
  appInited: boolean;
  bridgePhase: string;
  fileId8: string | null;
  bridgeState: Record<string, unknown>;
};

export type MindMapNativeSaveCoordinatorDeps = {
  getBridgeContext: () => MindMapNativeSaveBridgeContext;
  postSaveRequest: (requestId: string) => boolean;
  onError: (message: string) => void;
  onRequestStart?: (requestId: string, source?: string) => void;
};

export type MindMapSaveResponseCorrelation = {
  isCurrentSaveResponse: boolean;
  isStaleRequestId: boolean;
  hostWaitedMs: number | null;
  requestId: string | null;
  hostRequestId: string | null;
};

export type MindMapNativeSaveCoordinator = {
  requestNativeSave(source?: string): Promise<boolean>;
  handleSaveProgress(payload: unknown): void;
  correlateSaveResponse(
    requestId: string | null | undefined,
  ): MindMapSaveResponseCorrelation;
  fulfillCurrentSave(ok: boolean): {
    waitedMs: number | null;
    requestId: string | null;
  };
  rejectCurrentSave(opts: {
    message?: string;
    warnLabel?: string;
    warnExtra?: Record<string, unknown>;
  }): void;
  getCurrentRequestId(): string | null;
  dispose(): void;
};

function buildTimeoutHint(ctx: MindMapNativeSaveBridgeContext): string {
  if (!ctx.bridgeReady) {
    return "mindmap 原生 iframe 未就绪（请运行 yarn build:production）";
  }
  if (!ctx.appInited) {
    return "mindmap 原生界面未完成初始化";
  }
  return "mindmap 原生界面未响应保存请求";
}

function buildProgressFailureMessage(
  progress: MindMapSaveProgressPayload,
): string {
  if (progress.phase === "skipped-not-ready") {
    return "mindmap 原生界面未就绪，无法保存";
  }
  return progress.message || "mindmap 保存失败";
}

export function createMindMapNativeSaveCoordinator(
  deps: MindMapNativeSaveCoordinatorDeps,
): MindMapNativeSaveCoordinator {
  let inFlightPromise: Promise<boolean> | null = null;
  let resolveSave: ((ok: boolean) => void) | null = null;
  let requestId: string | null = null;
  let startedAt: number | null = null;
  let lastProgress: MindMapSaveProgressPayload | null = null;
  let timeoutId: number | null = null;
  let absoluteDeadlineAt = 0;

  const reset = () => {
    if (timeoutId != null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
    resolveSave = null;
    inFlightPromise = null;
    requestId = null;
    startedAt = null;
    lastProgress = null;
  };

  const hostWaitedMs = (): number | null =>
    startedAt != null ? Math.round(performance.now() - startedAt) : null;

  const fireSaveTimeout = () => {
    const ctx = deps.getBridgeContext();
    const waitedMs = hostWaitedMs();
    const reason =
      startedAt != null && performance.now() >= absoluteDeadlineAt
        ? "absolute"
        : "inactivity";
    warnMindMapBridge("requestNativeSave | timeout", {
      requestId,
      reason,
      waitedMs,
      inactivityTimeoutMs: MINDMAP_SAVE_INACTIVITY_TIMEOUT_MS,
      absoluteTimeoutMs: MINDMAP_SAVE_ABSOLUTE_TIMEOUT_MS,
      fileId8: ctx.fileId8,
      bridgePhase: ctx.bridgePhase,
      nativeSaveProgress: lastProgress,
      bridgeState: ctx.bridgeState,
    });
    const resolve = resolveSave;
    reset();
    deps.onError(buildTimeoutHint(ctx));
    resolve?.(false);
  };

  const scheduleInactivityTimeout = () => {
    if (timeoutId != null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
    const remaining = Math.max(
      0,
      Math.min(
        MINDMAP_SAVE_INACTIVITY_TIMEOUT_MS,
        absoluteDeadlineAt - performance.now(),
      ),
    );
    timeoutId = window.setTimeout(fireSaveTimeout, remaining);
  };

  const requestNativeSave = (source?: string): Promise<boolean> => {
    if (inFlightPromise) {
      debugMindMapBridge("requestNativeSave | reuse in-flight promise", {
        requestId,
        source,
        waitedMs: hostWaitedMs(),
      });
      return inFlightPromise;
    }

    const ctx = deps.getBridgeContext();
    debugMindMapBridge("requestNativeSave | start", ctx.bridgeState);

    const promise = new Promise<boolean>((resolve) => {
      const nextRequestId = `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;
      const nextStartedAt = performance.now();
      requestId = nextRequestId;
      startedAt = nextStartedAt;
      absoluteDeadlineAt = nextStartedAt + MINDMAP_SAVE_ABSOLUTE_TIMEOUT_MS;
      resolveSave = resolve;
      lastProgress = null;
      deps.onRequestStart?.(nextRequestId, source);

      debugMindMapBridge("requestNativeSave | dispatched", {
        requestId: nextRequestId,
        source,
        fileId8: ctx.fileId8,
        bridgePhase: ctx.bridgePhase,
        inactivityTimeoutMs: MINDMAP_SAVE_INACTIVITY_TIMEOUT_MS,
        absoluteTimeoutMs: MINDMAP_SAVE_ABSOLUTE_TIMEOUT_MS,
        ...ctx.bridgeState,
      });

      scheduleInactivityTimeout();

      if (!ctx.appInited) {
        warnMindMapBridge("requestNativeSave | app not inited yet", {
          requestId: nextRequestId,
          bridgeState: ctx.bridgeState,
        });
      }

      const posted = deps.postSaveRequest(nextRequestId);
      if (!posted) {
        warnMindMapBridge("requestNativeSave | postMessage not sent", {
          requestId: nextRequestId,
          postMs: Math.round(performance.now() - nextStartedAt),
          bridgeState: ctx.bridgeState,
        });
        reset();
        resolve(false);
        return;
      }

      debugMindMapBridge("requestNativeSave | posted", {
        requestId: nextRequestId,
        postMs: Math.round(performance.now() - nextStartedAt),
      });
    });

    inFlightPromise = promise;
    void promise.finally(() => {
      if (inFlightPromise === promise) {
        inFlightPromise = null;
      }
    });
    return promise;
  };

  const handleSaveProgress = (payload: unknown) => {
    const progress = parseMindMapSaveProgress(payload);
    if (!progress?.requestId || progress.requestId !== requestId) {
      return;
    }
    lastProgress = progress;
    const waitedMs = hostWaitedMs();
    const ctx = deps.getBridgeContext();
    debugMindMapBridge("mindMapSaveProgress", {
      ...progress,
      hostWaitedMs: waitedMs,
      fileId8: ctx.fileId8,
    });

    if (progress.phase === "skipped-not-ready" || progress.phase === "failed") {
      warnMindMapBridge(`requestNativeSave | ${progress.phase}`, {
        ...progress,
        hostWaitedMs: waitedMs,
        fileId8: ctx.fileId8,
      });
      if (!resolveSave) {
        return;
      }
      const resolve = resolveSave;
      reset();
      deps.onError(buildProgressFailureMessage(progress));
      resolve(false);
      return;
    }

    if (progress.phase === "concurrent") {
      warnMindMapBridge("requestNativeSave | concurrent", {
        ...progress,
        hostWaitedMs: waitedMs,
        fileId8: ctx.fileId8,
      });
    }

    scheduleInactivityTimeout();
  };

  const correlateSaveResponse = (
    saveRequestId: string | null | undefined,
  ): MindMapSaveResponseCorrelation => {
    const hostRequestId = requestId;
    const normalizedRequestId = saveRequestId ?? null;
    const isCurrentSaveResponse =
      !!resolveSave &&
      !!normalizedRequestId &&
      normalizedRequestId === hostRequestId;
    const isStaleRequestId =
      !!normalizedRequestId && normalizedRequestId !== hostRequestId;
    return {
      isCurrentSaveResponse,
      isStaleRequestId,
      hostWaitedMs: hostWaitedMs(),
      requestId: normalizedRequestId,
      hostRequestId,
    };
  };

  const fulfillCurrentSave = (ok: boolean) => {
    const waitedMs = hostWaitedMs();
    const fulfilledRequestId = requestId;
    const resolve = resolveSave;
    reset();
    resolve?.(ok);
    return { waitedMs, requestId: fulfilledRequestId };
  };

  const rejectCurrentSave = (opts: {
    message?: string;
    warnLabel?: string;
    warnExtra?: Record<string, unknown>;
  }) => {
    if (!resolveSave) {
      return;
    }
    if (opts.warnLabel) {
      warnMindMapBridge(opts.warnLabel, {
        requestId,
        hostWaitedMs: hostWaitedMs(),
        ...opts.warnExtra,
      });
    }
    const resolve = resolveSave;
    reset();
    if (opts.message) {
      deps.onError(opts.message);
    }
    resolve(false);
  };

  return {
    requestNativeSave,
    handleSaveProgress,
    correlateSaveResponse,
    fulfillCurrentSave,
    rejectCurrentSave,
    getCurrentRequestId: () => requestId,
    dispose: reset,
  };
}
