import { beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "editorhub-app-settings";

async function loadSettingsModule() {
  vi.resetModules();
  return import("./appSettings");
}

describe("appSettings debug logging mode", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("normalizes legacy debugModeEnabled=true to ai mode", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        debugModeEnabled: true,
      }),
    );

    const { getAppSettings } = await loadSettingsModule();

    expect(getAppSettings()).toMatchObject({
      debugLoggingMode: "ai",
      debugModeEnabled: true,
    });
  });

  it("normalizes legacy debugModeEnabled=false to off mode", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        debugModeEnabled: false,
      }),
    );

    const { getAppSettings } = await loadSettingsModule();

    expect(getAppSettings()).toMatchObject({
      debugLoggingMode: "off",
      debugModeEnabled: false,
    });
  });

  it("keeps the legacy boolean mirrored when updating the new mode", async () => {
    const { getAppSettings, updateAppSettings } = await loadSettingsModule();

    updateAppSettings({ debugLoggingMode: "basic" });

    expect(getAppSettings()).toMatchObject({
      debugLoggingMode: "basic",
      debugModeEnabled: true,
    });
  });

  it("keeps the new mode mirrored when updating the legacy boolean", async () => {
    const { getAppSettings, updateAppSettings } = await loadSettingsModule();

    updateAppSettings({ debugModeEnabled: true });

    expect(getAppSettings()).toMatchObject({
      debugLoggingMode: "ai",
      debugModeEnabled: true,
    });
  });
});
