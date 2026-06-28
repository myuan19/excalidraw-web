import { isDebugRuntimeEnabled } from "../../data/debugCapability";
import { traceExcalidrawHostWorkDeferred } from "../../lib/issueDiagTrace";

/** Tracks active Excalidraw pointer drags so desktop host work can pause. */
let activeDragCount = 0;
let lastDragEndedAt = 0;
const deferredHostWork: Array<() => void> = [];
let cooldownFlushTimer: ReturnType<typeof setTimeout> | null = null;

/** Keep catalog/list apply off the pointer-up + next-drag paint window. */
const HOST_WORK_COOLDOWN_MS = 400;

export function beginExcalidrawPointerDrag(): void {
  activeDragCount += 1;
  if (cooldownFlushTimer !== null) {
    clearTimeout(cooldownFlushTimer);
    cooldownFlushTimer = null;
  }
}

function flushDeferredHostWork(): void {
  if (activeDragCount > 0 || deferredHostWork.length === 0) {
    return;
  }
  const pending = deferredHostWork.splice(0);
  if (isDebugRuntimeEnabled()) {
    traceExcalidrawHostWorkDeferred("hostWork.flush", {
      count: pending.length,
    });
  }
  const flushStartedAt = performance.now();
  for (let index = 0; index < pending.length; index += 1) {
    const run = pending[index];
    const itemStartedAt = performance.now();
    run();
    if (isDebugRuntimeEnabled()) {
      const itemMs = Math.round(performance.now() - itemStartedAt);
      if (itemMs > 8 || index === 0) {
        traceExcalidrawHostWorkDeferred("hostWork.item", {
          index,
          itemMs,
          totalMs: Math.round(performance.now() - flushStartedAt),
        });
      }
    }
  }
}

function scheduleDeferredHostWorkFlush(): void {
  if (activeDragCount > 0 || deferredHostWork.length === 0) {
    return;
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      flushDeferredHostWork();
      if (deferredHostWork.length > 0) {
        scheduleCooldownHostWorkFlush();
      }
    });
  });
}

function scheduleCooldownHostWorkFlush(): void {
  if (activeDragCount > 0 || deferredHostWork.length === 0) {
    return;
  }
  if (cooldownFlushTimer !== null) {
    clearTimeout(cooldownFlushTimer);
  }
  const remaining = Math.max(
    0,
    HOST_WORK_COOLDOWN_MS - (performance.now() - lastDragEndedAt),
  );
  cooldownFlushTimer = setTimeout(() => {
    cooldownFlushTimer = null;
    flushDeferredHostWork();
  }, remaining);
}

export function endExcalidrawPointerDrag(): void {
  activeDragCount = Math.max(0, activeDragCount - 1);
  if (activeDragCount > 0) {
    return;
  }
  lastDragEndedAt = performance.now();
  scheduleDeferredHostWorkFlush();
}

export function isExcalidrawPointerDragActive(): boolean {
  return activeDragCount > 0;
}

export function shouldDeferHeavyHostWorkForExcalidraw(): boolean {
  if (activeDragCount > 0) {
    return true;
  }
  return performance.now() - lastDragEndedAt < HOST_WORK_COOLDOWN_MS;
}

/** Run now, or after pointer drag + short cooldown (same eventual outcome). */
export function runAfterExcalidrawPointerDrag(run: () => void): void {
  if (!shouldDeferHeavyHostWorkForExcalidraw()) {
    run();
    return;
  }
  deferredHostWork.push(run);
  if (isDebugRuntimeEnabled()) {
    traceExcalidrawHostWorkDeferred("hostWork.defer", {
      queueSize: deferredHostWork.length,
      activeDragCount,
      sinceDragEndMs:
        lastDragEndedAt > 0
          ? Math.round(performance.now() - lastDragEndedAt)
          : null,
    });
  }
  if (activeDragCount === 0) {
    scheduleCooldownHostWorkFlush();
  }
}

/** Test helper: flush deferred queue synchronously. */
export function flushExcalidrawDeferredHostWorkForTests(): void {
  if (cooldownFlushTimer !== null) {
    clearTimeout(cooldownFlushTimer);
    cooldownFlushTimer = null;
  }
  flushDeferredHostWork();
}
