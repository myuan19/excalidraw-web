import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadModules() {
  vi.resetModules();
  const appSettings = await import("./appSettings");
  const debugCapability = await import("./debugCapability");
  return { appSettings, debugCapability };
}

describe("debugCapability", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads server debug capability", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ debug: { allowed: true } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );

    const { debugCapability } = await loadModules();
    await debugCapability.loadDebugCapability();

    expect(debugCapability.getDebugCapability()).toEqual({
      loaded: true,
      allowed: true,
    });
  });

  it("forces local debug mode off when server does not allow debug", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ debug: { allowed: false } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );

    const { appSettings, debugCapability } = await loadModules();
    appSettings.updateAppSettings({ debugLoggingMode: "ai" });

    await debugCapability.loadDebugCapability();

    expect(appSettings.getAppSettings().debugLoggingMode).toBe("off");
    expect(debugCapability.isDebugRuntimeEnabled()).toBe(false);
  });
});
