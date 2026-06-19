import { afterEach, describe, expect, it, vi } from "vitest";

async function loadDevDebug() {
  vi.resetModules();
  return import("./devDebug");
}

function mockDebugRuntime(enabled: boolean): void {
  vi.doMock("../data/debugCapability", () => ({
    isDebugAllowed: () => enabled,
    isDebugRuntimeEnabled: () => enabled,
  }));
}

describe("devDebug runtime gating", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.doUnmock("../data/debugCapability");
  });

  it("is off when runtime debug is disabled", async () => {
    mockDebugRuntime(false);
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});

    const { devDebug, isDevDebugChannelEnabled } = await loadDevDebug();
    expect(isDevDebugChannelEnabled("editor-open")).toBe(false);
    devDebug("editor-open", "test");
    expect(spy).not.toHaveBeenCalled();
  });

  it("is on when runtime debug is enabled", async () => {
    mockDebugRuntime(true);
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});

    const { devDebug, isDevDebugChannelEnabled } = await loadDevDebug();
    expect(isDevDebugChannelEnabled("editor-open")).toBe(true);
    devDebug("editor-open", "test");
    expect(spy).toHaveBeenCalled();
    expect(String(spy.mock.calls[0]?.[0])).toContain("dev.editor-open.test");
  });
});
