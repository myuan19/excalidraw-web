import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadAppSettings() {
  vi.resetModules();
  return import("./appSettings");
}

describe("appSettings debug logging mode", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("keeps the deprecated boolean in sync with debugLoggingMode", async () => {
    const {
      getAppSettings,
      isAiDebugLoggingEnabled,
      isDebugLoggingEnabled,
      updateAppSettings,
    } = await loadAppSettings();

    updateAppSettings({ debugLoggingMode: "basic" });
    expect(getAppSettings().debugLoggingEnabled).toBe(true);
    expect(isDebugLoggingEnabled()).toBe(true);
    expect(isAiDebugLoggingEnabled()).toBe(false);

    updateAppSettings({ debugLoggingMode: "ai" });
    expect(getAppSettings().debugLoggingEnabled).toBe(true);
    expect(isAiDebugLoggingEnabled()).toBe(true);

    updateAppSettings({ debugLoggingMode: "off" });
    expect(getAppSettings().debugLoggingEnabled).toBe(false);
    expect(isDebugLoggingEnabled()).toBe(false);
  });

  it("migrates the deprecated debugLoggingEnabled boolean to ai mode", async () => {
    localStorage.setItem(
      "editorhub-app-settings",
      JSON.stringify({ debugLoggingEnabled: true }),
    );
    const fresh = await loadAppSettings();

    expect(fresh.getDebugLoggingMode()).toBe("ai");
  });

  it("accepts the deprecated boolean writer", async () => {
    const { getDebugLoggingMode, updateAppSettings } = await loadAppSettings();

    updateAppSettings({ debugLoggingEnabled: true });
    expect(getDebugLoggingMode()).toBe("ai");

    updateAppSettings({ debugLoggingEnabled: false });
    expect(getDebugLoggingMode()).toBe("off");
  });
});

describe("appSettings default data directory", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to a Documents/EditorHub folder", async () => {
    const { getAppSettings } = await loadAppSettings();

    expect(getAppSettings().defaultDataDirectoryPath).toBe("Documents/EditorHub");
  });

  it("normalizes invalid default data directory values", async () => {
    localStorage.setItem(
      "editorhub-app-settings",
      JSON.stringify({ defaultDataDirectoryPath: 42 }),
    );
    const { getAppSettings } = await loadAppSettings();

    expect(getAppSettings().defaultDataDirectoryPath).toBe("Documents/EditorHub");
  });

  it("trims persisted default data directory values", async () => {
    const { getAppSettings, updateAppSettings } = await loadAppSettings();

    updateAppSettings({ defaultDataDirectoryPath: "  C:/Users/me/Documents/EditorHub  " });

    expect(getAppSettings().defaultDataDirectoryPath).toBe(
      "C:/Users/me/Documents/EditorHub",
    );
  });
});
