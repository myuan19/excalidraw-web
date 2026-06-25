import { afterEach, describe, expect, it, vi } from "vitest";

describe("apiTransport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as Window & { editorHubDesktop?: unknown }).editorHubDesktop;
  });

  it("uses IPC when editorHubDesktop is present", async () => {
    const invokeApi = vi.fn(async () => ({
      status: 200,
      headers: { "content-type": "application/json" },
      bodyText: '{"ok":true}',
    }));
    window.editorHubDesktop = {
      platform: "win32",
      invokeApi,
      subscribeCatalogChanges: () => () => {},
    };

    vi.resetModules();
    const { apiTransport } = await import("./apiTransport");

    const result = await apiTransport.request({
      method: "GET",
      path: "/api/health",
    });

    expect(invokeApi).toHaveBeenCalledWith({
      method: "GET",
      path: "/api/health",
      headers: {},
      body: null,
    });
    expect(JSON.parse(result.bodyText)).toEqual({ ok: true });
  });

  it("uses fetch when running in the web shell", async () => {
    const fetchMock = vi.fn(async () => ({
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => '{"ok":true}',
    }));
    vi.stubGlobal("fetch", fetchMock);

    vi.resetModules();
    const { apiTransport } = await import("./apiTransport");

    const result = await apiTransport.request({
      method: "GET",
      path: "/api/health",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/health",
      expect.objectContaining({ method: "GET" }),
    );
    expect(JSON.parse(result.bodyText)).toEqual({ ok: true });
  });
});
