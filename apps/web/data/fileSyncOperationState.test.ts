import { afterEach, describe, expect, it, vi } from "vitest";

import {
  consumeQueuedRemoteUpdateTarget,
  isPassiveSaveBlocked,
  isRemoteApplyInProgress,
  peekQueuedRemoteUpdateTarget,
  queueRemoteUpdateTarget,
  runRemoteFileApply,
} from "./fileSyncOperationState";

afterEach(() => {
  vi.useRealTimers();
});

describe("fileSyncOperationState", () => {
  it("keeps passive saves blocked through the remote apply settle window", async () => {
    vi.useFakeTimers();
    const fileId = "file-remote-apply-settle";
    let applied = false;

    const applyPromise = runRemoteFileApply(
      fileId,
      async () => {
        applied = true;
      },
      { settleFrames: 0, settleMs: 50 },
    );

    await Promise.resolve();

    expect(applied).toBe(true);
    expect(isRemoteApplyInProgress(fileId)).toBe(true);
    expect(isPassiveSaveBlocked(fileId)).toBe(true);

    await vi.advanceTimersByTimeAsync(49);
    expect(isPassiveSaveBlocked(fileId)).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    await applyPromise;

    expect(isRemoteApplyInProgress(fileId)).toBe(false);
    expect(isPassiveSaveBlocked(fileId)).toBe(false);
  });

  it("stores and consumes the latest queued remote update target", () => {
    const fileId = "file-queued-target";
    const older = {
      fileId,
      contentSha256: "older-sha",
      serverVersion: 1,
      source: "cross-tab" as const,
    };
    const latest = {
      fileId,
      contentSha256: "latest-sha",
      serverVersion: 2,
      source: "cross-tab" as const,
    };

    queueRemoteUpdateTarget(older);
    queueRemoteUpdateTarget(latest);

    expect(peekQueuedRemoteUpdateTarget(fileId)).toEqual(latest);
    expect(consumeQueuedRemoteUpdateTarget(fileId)).toEqual(latest);
    expect(consumeQueuedRemoteUpdateTarget(fileId)).toBeNull();
  });
});
