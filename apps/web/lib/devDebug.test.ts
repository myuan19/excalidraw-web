import { afterEach, describe, expect, it, vi } from "vitest";

import { devDebug, isDevDebugChannelEnabled } from "./devDebug";

describe("devDebug production gating", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("is off in PROD without deploy debug or per-channel flag", () => {
    vi.stubEnv("PROD", true);
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_APP_DEPLOY_DEBUG", "");
    vi.stubEnv("VITE_APP_ENABLE_EDITOR_OPEN_DEBUG", "");
    expect(isDevDebugChannelEnabled("editor-open")).toBe(false);
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    devDebug("editor-open", "test");
    expect(spy).not.toHaveBeenCalled();
  });

  it("is on in PROD when VITE_APP_DEPLOY_DEBUG=true", () => {
    vi.stubEnv("PROD", true);
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_APP_DEPLOY_DEBUG", "true");
    expect(isDevDebugChannelEnabled("editor-open")).toBe(true);
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    devDebug("editor-open", "test");
    expect(spy).toHaveBeenCalled();
  });
});
