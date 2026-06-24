import { debugMindMapBridge, warnMindMapBridge } from "./mindMapBridgeDebug";
import { logPerf } from "../../lib/perfLog";
import {
  parseMindMapSaveProgress,
  type MindMapSaveProgressPayload,
} from "./mindMapBridgeProtocol";

import type { ManagedDocument } from "../../data/documentTypes";
import type { MindMapDocumentData } from "../../data/formats/MindMapAdapter";

export type MindMapNativeSaveResult = {
  document: ManagedDocument<MindMapDocumentData>;
  thumbnail?: string | null;
};

export const MINDMAP_SAVE_INACTIVITY_TIMEOUT_MS = 15_000;
/** 宿主绝对上限：即使持续有心跳，单次保存等待也不超过此值。 */
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
};

export type MindMapSaveResponseCorrelation = {
  isCurrentSaveResponse: boolean;
  isStaleRequestId: boolean;
  hostWaitedMs: number | null;
  requestId: string | null;
  hostRequestId: string | null;
};

export type MindMapNativeSaveCoordinator = {
  requestNativeSave(): Promise<MindMapNativeSaveResult | null>;
  handleSaveProgress(payload: unknown): void;
  correlateSaveResponse(
    requestId: string | null | undefined,
  ): MindMapSaveResponseCorrelation;
  fulfillCurrentSave(result: MindMapNativeSaveResult): {
    waitedMs: number | null;
    requestId: string | null;
  };
  rejectCurrentSave(opts: {
    message?: string;
    warnLabel?: string;
    warnExtra?: Record<string, unknown>;
  }): void;
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

/**
 * Host 侧 native 保存请求协调器：requestId 关联、静默/绝对超时、progress 心跳续期。
 * 纯内存 + 定时器，不依赖 React；由 MindMapEditorShell 创建并接入 postMessage。
 */
export function createMindMapNativeSaveCoordinator(
  deps: MindMapNativeSaveCoordinatorDeps,
): MindMapNativeSaveCoordinator {
  let inFlightPromise: Promise<MindMapNativeSaveResult | null> | null = null;
  let resolveSave: ((result: MindMapNativeSaveResult | null) => void) | null =
    null;
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
    resolve?.(null);
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

  const requestNativeSave = (): Promise<MindMapNativeSaveResult | null> => {
    if (inFlightPromise) {
      debugMindMapBridge("requestNativeSave | reuse in-flight promise", {
        requestId,
        waitedMs: hostWaitedMs(),
      });
      return inFlightPromise;
    }

    const ctx = deps.getBridgeContext();
    debugMindMapBridge("requestNativeSave | start", ctx.bridgeState);

    const promise = new Promise<MindMapNativeSaveResult | null>((resolve) => {
      const nextRequestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const nextStartedAt = performance.now();
      requestId = nextRequestId;
      startedAt = nextStartedAt;
      absoluteDeadlineAt =
        nextStartedAt + MINDMAP_SAVE_ABSOLUTE_TIMEOUT_MS;
      resolveSave = resolve;
      lastProgress = null;

      debugMindMapBridge("requestNativeSave | dispatched", {
        requestId: nextRequestId,
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
        resolve(null);
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
    logPerf("mindmap.native_progress", {
      fileId8: ctx.fileId8,
      requestId: progress.requestId.slice(0, 32),
      phase: progress.phase,
      elapsedMs: progress.elapsedMs ?? null,
      hostWaitedMs: waitedMs,
      waitReason: progress.waitReason ?? null,
      message: progress.message ?? null,
      snapshotMs: progress.snapshotMs ?? null,
      thumbnailMs: progress.thumbnailMs ?? null,
      hasThumbnail: progress.hasThumbnail ?? null,
    });
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
      resolve(null);
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

  const fulfillCurrentSave = (result: MindMapNativeSaveResult) => {
    const waitedMs = hostWaitedMs();
    const fulfilledRequestId = requestId;
    const resolve = resolveSave;
    reset();
    resolve?.(result);
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
    resolve(null);
  };

  const dispose = () => {
    reset();
  };

  return {
    requestNativeSave,
    handleSaveProgress,
    correlateSaveResponse,
    fulfillCurrentSave,
    rejectCurrentSave,
    dispose,
  };
}
