import { beforeEach, describe, expect, it } from "vitest";

import { isAutoSaveEligibleFile, isAutoSaveLabel } from "./autoSaveSession";
import { updateAppSettings } from "./appSettings";
import { CHECKPOINT_LABELS, resolveCheckpointPolicy } from "./checkpointPolicy";

beforeEach(() => {
  updateAppSettings({ autoSaveEnabled: false, checkpointIntervalMin: 30 });
});

describe("isAutoSaveEligibleFile", () => {
  it("only allows persisted server file ids", () => {
    expect(isAutoSaveEligibleFile(null)).toBe(false);
    expect(isAutoSaveEligibleFile(undefined)).toBe(false);
    expect(isAutoSaveEligibleFile("")).toBe(false);
    expect(isAutoSaveEligibleFile("local-draft:abc")).toBe(false);
    expect(isAutoSaveEligibleFile("a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(
      true,
    );
  });
});

describe("checkpoint policy", () => {
  it("uses interval checkpoints for manual saves", () => {
    expect(resolveCheckpointPolicy("toolbar")).toEqual({
      mode: "interval",
      intervalMinutes: 30,
      label: CHECKPOINT_LABELS.interval,
    });
    expect(resolveCheckpointPolicy("hotkey")).toEqual({
      mode: "interval",
      intervalMinutes: 30,
      label: CHECKPOINT_LABELS.interval,
    });
  });

  it("does not checkpoint automatic or visibility saves when auto-save is disabled", () => {
    updateAppSettings({ autoSaveEnabled: false, checkpointIntervalMin: 20 });

    expect(resolveCheckpointPolicy("auto")).toEqual({ mode: "none" });
    expect(resolveCheckpointPolicy("visibility")).toEqual({ mode: "none" });
    expect(resolveCheckpointPolicy("thumbnail")).toEqual({ mode: "none" });
    expect(resolveCheckpointPolicy("home")).toEqual({
      mode: "interval",
      intervalMinutes: 20,
      label: CHECKPOINT_LABELS.interval,
    });
  });

  it("uses the configured interval for latest saves when auto-save is enabled", () => {
    updateAppSettings({ autoSaveEnabled: true, checkpointIntervalMin: 60 });

    const intervalPolicy = {
      mode: "interval" as const,
      intervalMinutes: 60,
      label: CHECKPOINT_LABELS.interval,
    };

    expect(resolveCheckpointPolicy("auto")).toEqual(intervalPolicy);
    expect(resolveCheckpointPolicy("visibility")).toEqual({ mode: "none" });
    expect(resolveCheckpointPolicy("thumbnail")).toEqual({ mode: "none" });
    expect(resolveCheckpointPolicy("home")).toEqual(intervalPolicy);
    expect(isAutoSaveLabel("auto:legacy")).toBe(true);
  });
});
