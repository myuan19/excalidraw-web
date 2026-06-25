import { afterEach, describe, expect, it } from "vitest";

import { CHECKPOINT_LABELS, resolveCheckpointPolicy } from "./checkpointPolicy";

describe("resolveCheckpointPolicy", () => {
  afterEach(() => {
    delete (window as Window & { editorHubDesktop?: unknown }).editorHubDesktop;
  });

  it("keeps web saves eligible for interval checkpoints", () => {
    expect(resolveCheckpointPolicy("sidebar")).toEqual({
      mode: "interval",
      intervalMinutes: 30,
      label: CHECKPOINT_LABELS.interval,
    });
  });

  it("disables checkpoints on desktop because latest is the local file", () => {
    window.editorHubDesktop = { platform: "win32" };

    expect(resolveCheckpointPolicy("sidebar")).toEqual({ mode: "none" });
    expect(resolveCheckpointPolicy("auto")).toEqual({ mode: "none" });
    expect(resolveCheckpointPolicy("home")).toEqual({ mode: "none" });
  });
});
