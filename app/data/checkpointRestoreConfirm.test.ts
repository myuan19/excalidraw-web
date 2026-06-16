import { beforeEach, describe, expect, it, vi } from "vitest";

import { confirmBeforeRestoreCheckpoint } from "./checkpointRestoreConfirm";

const fetchCheckpointCoverage = vi.fn();

vi.mock("./checkpointContentStatus", () => ({
  fetchCheckpointCoverage: (...args: unknown[]) =>
    fetchCheckpointCoverage(...args),
  needsRestoreBackupOffer: (coverage: { isAlreadyArchived: boolean }) =>
    !coverage.isAlreadyArchived,
}));

describe("confirmBeforeRestoreCheckpoint", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    fetchCheckpointCoverage.mockReset();
  });

  it("skips backup prompt when current latest already has a matching archive", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    fetchCheckpointCoverage.mockResolvedValue({
      isAlreadyArchived: true,
      currentContentSha256: "sha-a",
      matchingArchive: {
        id: "archive-a",
        label: "checkpoint:manual",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    });
    const saveCurrentAsCheckpoint = vi.fn(async () => true);

    const result = await confirmBeforeRestoreCheckpoint({
      fileId: "file-1",
      saveCurrentAsCheckpoint,
    });

    expect(result).toBe(true);
    expect(globalThis.confirm).toHaveBeenCalledTimes(1);
    expect(saveCurrentAsCheckpoint).not.toHaveBeenCalled();
  });

  it("offers backup prompt when latest is not archived yet", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    fetchCheckpointCoverage.mockResolvedValue({
      isAlreadyArchived: false,
      currentContentSha256: "sha-new",
      matchingArchive: null,
    });
    const saveCurrentAsCheckpoint = vi.fn(async () => true);

    const result = await confirmBeforeRestoreCheckpoint({
      fileId: "file-1",
      saveCurrentAsCheckpoint,
    });

    expect(result).toBe(true);
    expect(globalThis.confirm).toHaveBeenCalledTimes(2);
    expect(saveCurrentAsCheckpoint).toHaveBeenCalledTimes(1);
  });
});
