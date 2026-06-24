import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MindMapAdapter } from "../../data/formats/registry";
import {
  createMindMapNativeSaveCoordinator,
  MINDMAP_SAVE_ABSOLUTE_TIMEOUT_MS,
  MINDMAP_SAVE_INACTIVITY_TIMEOUT_MS,
} from "./mindMapNativeSaveCoordinator";

describe("mindMapNativeSaveCoordinator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createCoordinator(onError = vi.fn()) {
    return createMindMapNativeSaveCoordinator({
      getBridgeContext: () => ({
        bridgeReady: true,
        appInited: true,
        bridgePhase: "app_ready",
        fileId8: "abcd1234",
        bridgeState: {},
      }),
      postSaveRequest: () => true,
      onError,
    });
  }

  it("reuses the in-flight save promise", async () => {
    const postSaveRequest = vi.fn(() => true);
    const coordinator = createMindMapNativeSaveCoordinator({
      getBridgeContext: () => ({
        bridgeReady: true,
        appInited: true,
        bridgePhase: "app_ready",
        fileId8: "abcd1234",
        bridgeState: {},
      }),
      postSaveRequest,
      onError: vi.fn(),
    });

    const first = coordinator.requestNativeSave();
    const second = coordinator.requestNativeSave();

    expect(second).toBe(first);
    expect(postSaveRequest).toHaveBeenCalledTimes(1);
  });

  it("times out when no progress heartbeats arrive", async () => {
    const onError = vi.fn();
    const coordinator = createCoordinator(onError);

    const savePromise = coordinator.requestNativeSave();
    await vi.advanceTimersByTimeAsync(MINDMAP_SAVE_INACTIVITY_TIMEOUT_MS + 1);

    await expect(savePromise).resolves.toBeNull();
    expect(onError).toHaveBeenCalledWith("mindmap 原生界面未响应保存请求");
  });

  it("extends inactivity timeout on progress heartbeats", async () => {
    const onError = vi.fn();
    const coordinator = createCoordinator(onError);

    const savePromise = coordinator.requestNativeSave();
    const hostRequestId = coordinator.correlateSaveResponse(null).hostRequestId;
    expect(hostRequestId).toBeTruthy();

    await vi.advanceTimersByTimeAsync(MINDMAP_SAVE_INACTIVITY_TIMEOUT_MS - 1);
    coordinator.handleSaveProgress({
      requestId: hostRequestId,
      phase: "thumbnail",
      elapsedMs: MINDMAP_SAVE_INACTIVITY_TIMEOUT_MS - 1,
    });

    await vi.advanceTimersByTimeAsync(MINDMAP_SAVE_INACTIVITY_TIMEOUT_MS - 1);
    expect(onError).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2);
    await expect(savePromise).resolves.toBeNull();
    expect(onError).toHaveBeenCalledWith("mindmap 原生界面未响应保存请求");
  });

  it("fails fast on terminal native progress", async () => {
    const onError = vi.fn();
    const coordinator = createCoordinator(onError);

    const savePromise = coordinator.requestNativeSave();
    const hostRequestId = coordinator.correlateSaveResponse(null).hostRequestId;

    coordinator.handleSaveProgress({
      requestId: hostRequestId,
      phase: "skipped-not-ready",
      elapsedMs: 10,
    });

    await expect(savePromise).resolves.toBeNull();
    expect(onError).toHaveBeenCalledWith("mindmap 原生界面未就绪，无法保存");
  });

  it("fulfills the current save response and drops stale request ids", async () => {
    const coordinator = createCoordinator();

    void coordinator.requestNativeSave();
    const hostRequestId = coordinator.correlateSaveResponse(null).hostRequestId;
    expect(hostRequestId).toBeTruthy();

    const stale = coordinator.correlateSaveResponse("stale-id");
    expect(stale.isStaleRequestId).toBe(true);
    expect(stale.isCurrentSaveResponse).toBe(false);

    const current = coordinator.correlateSaveResponse(hostRequestId);
    expect(current.isCurrentSaveResponse).toBe(true);

    const document = MindMapAdapter.toDocument({
      root: { data: { text: "x" }, children: [] },
    });
    const result = coordinator.fulfillCurrentSave({
      document,
      thumbnail: "thumb",
    });

    expect(result.waitedMs).not.toBeNull();
    expect(result.requestId).toBe(hostRequestId);
    expect(
      coordinator.correlateSaveResponse(hostRequestId).isCurrentSaveResponse,
    ).toBe(false);
  });

  it("still fails after the absolute timeout even with heartbeats", async () => {
    const onError = vi.fn();
    const coordinator = createCoordinator(onError);

    const savePromise = coordinator.requestNativeSave();
    const hostRequestId = coordinator.correlateSaveResponse(null).hostRequestId;

    for (let elapsed = 0; elapsed < MINDMAP_SAVE_ABSOLUTE_TIMEOUT_MS; elapsed += 10_000) {
      coordinator.handleSaveProgress({
        requestId: hostRequestId,
        phase: "thumbnail",
        elapsedMs: elapsed,
      });
      await vi.advanceTimersByTimeAsync(10_000);
    }

    await vi.advanceTimersByTimeAsync(1);
    await expect(savePromise).resolves.toBeNull();
    expect(onError).toHaveBeenCalledWith("mindmap 原生界面未响应保存请求");
  });
});
