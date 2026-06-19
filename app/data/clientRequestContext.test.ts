import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadRuntimeModules() {
  vi.resetModules();
  const appSettings = await import("./appSettings");
  const debugCapability = await import("./debugCapability");
  const clientRequestContext = await import("./clientRequestContext");
  return { appSettings, debugCapability, clientRequestContext };
}

describe("clientRequestContext", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("builds request headers with runtime debug context", async () => {
    sessionStorage.setItem("editorhub-debug-case-id", "CASE1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ debug: { allowed: true } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const { appSettings, debugCapability, clientRequestContext } =
      await loadRuntimeModules();
    await debugCapability.loadDebugCapability();
    appSettings.updateAppSettings({ debugLoggingMode: "ai" });
    const { buildClientRequestHeaders } = clientRequestContext;
    const headers = buildClientRequestHeaders("auto-save");

    expect(headers["X-EditorHub-Run-Id"]).toMatch(/^run-/);
    expect(headers["X-EditorHub-Trace-Id"]).toMatch(/^trace-/);
    expect(headers["X-EditorHub-Request-Id"]).toBe("req-1");
    expect(headers["X-EditorHub-Tab-Id"]).toMatch(/^tab-/);
    expect(headers["X-EditorHub-Request-Seq"]).toBe("1");
    expect(headers["X-EditorHub-Case-Id"]).toBe("CASE1");
    expect(headers["X-EditorHub-Source"]).toBe("auto-save");
  });

  it("returns logger context using stable session ids", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ debug: { allowed: true } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const { appSettings, debugCapability, clientRequestContext } =
      await loadRuntimeModules();
    await debugCapability.loadDebugCapability();
    appSettings.updateAppSettings({ debugLoggingMode: "ai" });
    const { buildClientRequestHeaders, getClientLoggerContext } =
      clientRequestContext;

    const first = buildClientRequestHeaders("getFile");
    const context = getClientLoggerContext();
    const second = buildClientRequestHeaders("save");

    expect(context).toMatchObject({
      run: first["X-EditorHub-Run-Id"],
      trace: first["X-EditorHub-Trace-Id"],
      tab: first["X-EditorHub-Tab-Id"],
    });
    expect(second["X-EditorHub-Run-Id"]).toBe(first["X-EditorHub-Run-Id"]);
    expect(second["X-EditorHub-Trace-Id"]).toBe(
      first["X-EditorHub-Trace-Id"],
    );
    expect(second["X-EditorHub-Request-Id"]).toBe("req-2");
  });

  it("omits debug headers when runtime debug is off", async () => {
    const { clientRequestContext } = await loadRuntimeModules();

    expect(clientRequestContext.buildClientRequestHeaders("auto-save")).toEqual(
      {},
    );
    expect(clientRequestContext.getClientLoggerContext()).toEqual({});
  });
});
