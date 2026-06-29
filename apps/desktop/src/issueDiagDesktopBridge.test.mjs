import { describe, expect, it, vi } from "vitest";

import { createIssueDiagDesktopBridge } from "./issueDiagDesktopBridge.mjs";

describe("createIssueDiagDesktopBridge", () => {
  it("writes structured issue.diag events", () => {
    const writeLog = vi.fn();
    const bridge = createIssueDiagDesktopBridge({ writeLog, now: () => 1000 });
    const result = bridge.handle({
      area: "excalidraw.drag",
      action: "geometry",
      phase: "branch",
      data: { dpr: 1.25, backingPerCssDpr: 1 },
    });
    expect(result).toEqual({ ok: true });
    expect(writeLog).toHaveBeenCalledWith(
      "diag",
      "issue.diag.excalidraw.drag.geometry",
      expect.objectContaining({
        tag: "issue.diag",
        area: "excalidraw.drag",
        action: "geometry",
        dpr: 1.25,
      }),
    );
  });

  it("rejects missing area or action", () => {
    const writeLog = vi.fn();
    const bridge = createIssueDiagDesktopBridge({ writeLog });
    expect(bridge.handle({ action: "x" })).toEqual({
      ok: false,
      reason: "missing-area-or-action",
    });
    expect(writeLog).not.toHaveBeenCalled();
  });
});
