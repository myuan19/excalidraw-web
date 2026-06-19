import { describe, expect, it, vi } from "vitest";

import { logDocumentVersion } from "./documentVersionLog";

describe("logDocumentVersion", () => {
  it("emits unified docVersion logs without throwing", () => {
    const info = vi.spyOn(console, "log").mockImplementation(() => {});
    logDocumentVersion({
      action: "session-set",
      fileId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      reason: "test",
      previousSessionVersion: 1,
      sessionVersion: 2,
      serverVersion: 2,
    });
    expect(info).toHaveBeenCalled();
    info.mockRestore();
  });
});
