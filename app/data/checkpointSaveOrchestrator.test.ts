import { describe, expect, it, vi } from "vitest";

import { executeCheckpointSave } from "./checkpointSaveOrchestrator";
import { CHECKPOINT_LABELS } from "./checkpointPolicy";

describe("executeCheckpointSave", () => {
  it("uses the server PUT flow for manual checkpoint checks when content is unchanged", async () => {
    const putDocument = vi.fn(async () => ({
      ok: true,
      skipped: true,
      content_sha256: "abc",
      checkpoint: { created: true, id: "arch-1" },
    }));

    const outcome = await executeCheckpointSave(
      {
        fileId: "file-1",
        source: "sidebar",
        contentHash: "abc",
        baselineHash: "abc",
        document: { kind: "excalidraw", data: {} },
      },
      {
        resolveFileThumbnailForPut: async () => undefined,
        resolveArchiveThumbnailSvg: async () =>
          '<svg data-excal-filelist-thumb="1"><rect width="10" height="10"/></svg>',
        putDocument,
      },
    );

    expect(outcome.checkpointCreated).toBe(true);
    expect(outcome.saved).toBe(true);
    expect(putDocument).toHaveBeenCalledWith({
      thumbnail: undefined,
      checkpointPolicy: {
        mode: "interval",
        intervalMinutes: 30,
        label: CHECKPOINT_LABELS.interval,
      },
    });
  });

  it("uses PUT when content changed", async () => {
    const putDocument = vi.fn(async () => ({
      ok: true,
      content_sha256: "next",
      checkpoint: { created: true, id: "arch-2" },
    }));

    const outcome = await executeCheckpointSave(
      {
        fileId: "file-1",
        source: "sidebar",
        contentHash: "next",
        baselineHash: "abc",
        document: { kind: "excalidraw", data: {} },
      },
      {
        resolveFileThumbnailForPut: async () => "<svg></svg>",
        resolveArchiveThumbnailSvg: async () => null,
        putDocument,
      },
    );

    expect(outcome.saved).toBe(true);
    expect(putDocument).toHaveBeenCalledTimes(1);
  });
});
