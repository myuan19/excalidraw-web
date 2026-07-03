import { devDebug } from "../../lib/devDebug";

/**
 * MindMap iframe 拖拽交互状态（native 桥经 `mindMapInteractionState` 上报）。
 *
 * 宿主与同源 iframe 共用一条主线程：空闲自动保存、草稿 localStorage 写盘等
 * 重活如果落在拖拽帧里，会直接吃掉 iframe 的拖拽帧预算（Excalidraw 侧对应
 * excalidrawPointerDrag 的 runAfterExcalidrawPointerDrag）。这里维护拖拽会话
 * 状态，把可延迟的重活推迟到拖拽结束 + 冷却窗口之后执行。
 */

/** 拖拽结束后的冷却窗口：让 drop 提交的渲染/绘制先落地。 */
const HOST_WORK_COOLDOWN_MS = 320;
/** 安全阀：mouseup 丢失（iframe 失焦等）时最长保持拖拽态的时间。 */
const DRAG_ACTIVE_SAFETY_MS = 15_000;

let dragActive = false;
let lastDragEndedAt = 0;
const deferredWork: Array<() => void> = [];
let cooldownFlushTimer: ReturnType<typeof setTimeout> | null = null;
let dragSafetyTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimer(timer: ReturnType<typeof setTimeout> | null): null {
  if (timer !== null) {
    clearTimeout(timer);
  }
  return null;
}

function flushDeferredWork(): void {
  if (dragActive || deferredWork.length === 0) {
    return;
  }
  const pending = deferredWork.splice(0);
  devDebug("mindmap-bridge", "nativeDrag.flushDeferredWork", {
    count: pending.length,
  });
  for (const run of pending) {
    try {
      run();
    } catch (error) {
      devDebug("mindmap-bridge", "nativeDrag.deferredWorkError", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function scheduleCooldownFlush(): void {
  if (dragActive || deferredWork.length === 0) {
    return;
  }
  cooldownFlushTimer = clearTimer(cooldownFlushTimer);
  const remaining = Math.max(
    0,
    HOST_WORK_COOLDOWN_MS - (performance.now() - lastDragEndedAt),
  );
  cooldownFlushTimer = setTimeout(() => {
    cooldownFlushTimer = null;
    flushDeferredWork();
  }, remaining);
}

export function setMindMapNativeDragging(active: boolean): void {
  if (dragActive === active) {
    return;
  }
  dragActive = active;
  dragSafetyTimer = clearTimer(dragSafetyTimer);
  if (active) {
    cooldownFlushTimer = clearTimer(cooldownFlushTimer);
    dragSafetyTimer = setTimeout(() => {
      dragSafetyTimer = null;
      if (dragActive) {
        devDebug("mindmap-bridge", "nativeDrag.safetyRelease", {
          afterMs: DRAG_ACTIVE_SAFETY_MS,
        });
        setMindMapNativeDragging(false);
      }
    }, DRAG_ACTIVE_SAFETY_MS);
    return;
  }
  lastDragEndedAt = performance.now();
  scheduleCooldownFlush();
}

export function isMindMapNativeDragActive(): boolean {
  return dragActive;
}

export function shouldDeferMindMapHostHeavyWork(): boolean {
  if (dragActive) {
    return true;
  }
  return performance.now() - lastDragEndedAt < HOST_WORK_COOLDOWN_MS;
}

/** 立即执行；若正处于拖拽/冷却窗口，则推迟到拖拽结束后统一执行。 */
export function runAfterMindMapNativeDrag(run: () => void): void {
  if (!shouldDeferMindMapHostHeavyWork()) {
    run();
    return;
  }
  deferredWork.push(run);
  if (!dragActive) {
    scheduleCooldownFlush();
  }
}

/** 测试辅助：同步冲掉队列并复位状态。 */
export function resetMindMapNativeInteractionForTests(): void {
  cooldownFlushTimer = clearTimer(cooldownFlushTimer);
  dragSafetyTimer = clearTimer(dragSafetyTimer);
  dragActive = false;
  lastDragEndedAt = 0;
  flushDeferredWork();
  deferredWork.length = 0;
}
