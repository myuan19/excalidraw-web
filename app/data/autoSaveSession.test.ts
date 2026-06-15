import { beforeEach, describe, expect, it } from "vitest";

import { isAutoSaveEligibleFile, isAutoSaveLabel } from "./autoSaveSession";
import { updateAppSettings } from "./appSettings";
import { CHECKPOINT_LABELS, resolveCheckpointPolicy } from "./checkpointPolicy";

beforeEach(() => {
  updateAppSettings({ checkpointIntervalMin: 0 });
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
  it("keeps manual saves as forced checkpoints", () => {
    expect(resolveCheckpointPolicy("toolbar")).toEqual({
      mode: "force",
      label: CHECKPOINT_LABELS.manual,
    });
    expect(resolveCheckpointPolicy("hotkey")).toEqual({
      mode: "force",
      label: CHECKPOINT_LABELS.manual,
    });
  });

  it("keeps automatic saves as latest-only when interval checkpoint is disabled", () => {
    updateAppSettings({ checkpointIntervalMin: 0 });

    expect(resolveCheckpointPolicy("auto")).toEqual({ mode: "none" });
    expect(resolveCheckpointPolicy("visibility")).toEqual({ mode: "none" });
    expect(resolveCheckpointPolicy("home")).toEqual({ mode: "none" });
  });

  it("uses interval checkpoints for automatic/latest saves when configured", () => {
    updateAppSettings({ checkpointIntervalMin: 30 });

    expect(resolveCheckpointPolicy("auto")).toEqual({
      mode: "interval",
      intervalMinutes: 30,
      label: CHECKPOINT_LABELS.interval,
    });
    expect(isAutoSaveLabel("auto:legacy")).toBe(true);
  });
});
