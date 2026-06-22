import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearDeferredAutoSave,
  isAutoSaveEligibleFile,
  isAutoSaveLabel,
  notifyEdit,
  rearmDeferredAutoSave,
  registerAutoSaveTrigger,
} from "./autoSaveSession";
import {
  isAutoSaveOnExitActive,
  isIdleAutoSaveActive,
  updateAppSettings,
} from "./appSettings";
import { CHECKPOINT_LABELS, resolveCheckpointPolicy } from "./checkpointPolicy";

vi.mock("./fileIdFromHash", () => ({
  getFileIdFromHash: vi.fn(() => "a1b2c3d4-e5f6-7890-abcd-ef1234567890"),
}));

import { getFileIdFromHash } from "./fileIdFromHash";

beforeEach(() => {
  vi.useRealTimers();
  updateAppSettings({
    autoSaveEnabled: false,
    autoSaveIdleSec: 10,
    checkpointIntervalMin: 30,
  });
  vi.mocked(getFileIdFromHash).mockReturnValue(
    "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  );
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

describe("idle auto-save setting", () => {
  it("can disable idle saves while keeping exit saves enabled", () => {
    updateAppSettings({ autoSaveEnabled: true, autoSaveIdleSec: 0 });

    expect(isIdleAutoSaveActive()).toBe(false);
    expect(isAutoSaveOnExitActive()).toBe(true);
  });

  it("requires both the global switch and a positive idle delay", () => {
    updateAppSettings({ autoSaveEnabled: false, autoSaveIdleSec: 120 });
    expect(isIdleAutoSaveActive()).toBe(false);

    updateAppSettings({ autoSaveEnabled: true, autoSaveIdleSec: 120 });
    expect(isIdleAutoSaveActive()).toBe(true);
  });
});

describe("idle timer settings refresh", () => {
  it("restarts the pending idle timer when autoSaveIdleSec changes", () => {
    vi.useFakeTimers();
    updateAppSettings({ autoSaveEnabled: true, autoSaveIdleSec: 10 });
    const trigger = vi.fn();
    const unregister = registerAutoSaveTrigger(trigger);

    notifyEdit();
    vi.advanceTimersByTime(5_000);
    updateAppSettings({ autoSaveIdleSec: 60 });

    vi.advanceTimersByTime(10_000);
    expect(trigger).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50_000);
    expect(trigger).toHaveBeenCalledTimes(1);

    unregister();
    vi.useRealTimers();
  });

  it("clears the pending idle timer when idle auto-save is disabled", () => {
    vi.useFakeTimers();
    updateAppSettings({ autoSaveEnabled: true, autoSaveIdleSec: 10 });
    const trigger = vi.fn();
    const unregister = registerAutoSaveTrigger(trigger);

    notifyEdit();
    updateAppSettings({ autoSaveIdleSec: 0 });

    vi.advanceTimersByTime(15_000);
    expect(trigger).not.toHaveBeenCalled();

    unregister();
    vi.useRealTimers();
  });

  it("rearms deferred auto-save through the idle timer", () => {
    vi.useFakeTimers();
    updateAppSettings({ autoSaveEnabled: true, autoSaveIdleSec: 10 });
    let shouldDefer = true;
    const trigger = vi.fn(() => {
      if (shouldDefer) {
        shouldDefer = false;
        return "deferred" as const;
      }
      return undefined;
    });
    const unregister = registerAutoSaveTrigger(trigger);

    notifyEdit();
    vi.advanceTimersByTime(10_000);
    expect(trigger).toHaveBeenCalledTimes(1);

    expect(rearmDeferredAutoSave()).toBe(true);
    vi.advanceTimersByTime(9_999);
    expect(trigger).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(trigger).toHaveBeenCalledTimes(2);

    unregister();
    vi.useRealTimers();
  });

  it("can clear a deferred auto-save without rearming it", () => {
    vi.useFakeTimers();
    updateAppSettings({ autoSaveEnabled: true, autoSaveIdleSec: 10 });
    const unregister = registerAutoSaveTrigger(() => "deferred");

    notifyEdit();
    vi.advanceTimersByTime(10_000);
    clearDeferredAutoSave();

    expect(rearmDeferredAutoSave()).toBe(false);

    unregister();
    vi.useRealTimers();
  });
});
