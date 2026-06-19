import { afterEach, describe, expect, it, vi } from "vitest";

import {
  consumeQueuedRemoteUpdateTarget,
  isPassiveSaveBlocked,
  isRemoteMutationSuppressed,
  peekQueuedRemoteUpdateTarget,
  queueRemoteUpdateTarget,
  runRemoteFileApply,
} from "./fileSyncOperationState";

afterEach(() => {
  vi.useRealTimers();
});

describe("fileSyncOperationState", () => {
  it("keeps remote mutation suppressed through the remote apply settle window", async () => {
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
    expect(isRemoteMutationSuppressed(fileId)).toBe(true);
    expect(isPassiveSaveBlocked(fileId)).toBe(true);

    await vi.advanceTimersByTimeAsync(49);
    expect(isRemoteMutationSuppressed(fileId)).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    await applyPromise;

    expect(isRemoteMutationSuppressed(fileId)).toBe(false);
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
