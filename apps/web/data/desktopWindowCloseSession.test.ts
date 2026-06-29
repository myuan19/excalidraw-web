import { describe, expect, it } from "vitest";

import {
  areDesktopCloseSavesSettled,
  beginDesktopWindowCloseSession,
  finishDesktopWindowCloseSession,
  markDesktopCloseSaveSettled,
  snapshotDesktopWindowCloseSession,
  waitForDesktopCloseSavesSettled,
} from "./desktopWindowCloseSession";

describe("desktopWindowCloseSession", () => {
  it("tracks pending saves until all are settled", async () => {
    const session = beginDesktopWindowCloseSession([
      { fileId: "a", dirty: true },
      { fileId: "b", dirty: false },
    ]);
    expect(areDesktopCloseSavesSettled(session)).toBe(false);

    const waitPromise = waitForDesktopCloseSavesSettled(session.id);
    markDesktopCloseSaveSettled("a", true);

    await expect(waitPromise).resolves.toBe(session);
    expect(snapshotDesktopWindowCloseSession()?.pendingCount).toBe(0);
    finishDesktopWindowCloseSession();
  });

  it("resolves immediately when there are no dirty tabs", async () => {
    const session = beginDesktopWindowCloseSession([
      { fileId: "clean", dirty: false },
    ]);
    await expect(waitForDesktopCloseSavesSettled(session.id)).resolves.toBe(
      session,
    );
    finishDesktopWindowCloseSession();
  });
});
