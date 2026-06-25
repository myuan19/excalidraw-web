import { describe, expect, it, vi } from "vitest";

import {
  createMindMapNativeSaveCoordinator,
  MINDMAP_SAVE_INACTIVITY_TIMEOUT_MS,
} from "./mindMapNativeSaveCoordinator";

function createCoordinatorHarness() {
  const postSaveRequest = vi.fn(() => true);
  const onError = vi.fn();
  const onRequestStart = vi.fn();
  const coordinator = createMindMapNativeSaveCoordinator({
    getBridgeContext: () => ({
      bridgeReady: true,
      appInited: true,
      bridgePhase: "app_ready",
      fileId8: "file1234",
      bridgeState: { phase: "app_ready" },
    }),
    postSaveRequest,
    onError,
    onRequestStart,
  });

  return { coordinator, postSaveRequest, onError, onRequestStart };
}

describe("MindMap native save coordinator", () => {
  it("reuses the in-flight native save request", async () => {
    const { coordinator, postSaveRequest, onRequestStart } =
      createCoordinatorHarness();

    const first = coordinator.requestNativeSave("manual");
    const second = coordinator.requestNativeSave("auto");

    expect(second).toBe(first);
    expect(postSaveRequest).toHaveBeenCalledTimes(1);
    expect(onRequestStart).toHaveBeenCalledTimes(1);

    coordinator.fulfillCurrentSave(true);
    await expect(first).resolves.toBe(true);
  });

  it("extends inactivity timeout when native reports progress", async () => {
    vi.useFakeTimers();
    try {
      const { coordinator, onError } = createCoordinatorHarness();
      const promise = coordinator.requestNativeSave("manual");
      const requestId = coordinator.getCurrentRequestId();

      expect(requestId).toBeTruthy();

      vi.advanceTimersByTime(MINDMAP_SAVE_INACTIVITY_TIMEOUT_MS - 1);
      coordinator.handleSaveProgress({
        requestId,
        phase: "thumbnail",
        elapsedMs: MINDMAP_SAVE_INACTIVITY_TIMEOUT_MS - 1,
      });
      vi.advanceTimersByTime(1);
      expect(onError).not.toHaveBeenCalled();

      coordinator.fulfillCurrentSave(true);
      await expect(promise).resolves.toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
