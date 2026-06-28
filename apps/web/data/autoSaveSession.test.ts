import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearDeferredAutoSave,
  fileNeedsIdleAutoSave,
  isAutoSaveEligibleFile,
  isAutoSaveLabel,
  notifyEdit,
  rearmDeferredAutoSave,
  rearmIdleAutoSaveIfNeeded,
  registerAutoSaveTrigger,
  shouldRearmIdleAutoSave,
} from "./autoSaveSession";
import { FileSyncState } from "./FileSyncState";
import {
  AUTO_SAVE_IDLE_SEC_OPTIONS,
  getAppSettings,
  isAutoSaveOnExitActive,
  isIdleAutoSaveActive,
  updateAppSettings,
} from "./appSettings";
import { CHECKPOINT_LABELS, resolveCheckpointPolicy } from "./checkpointPolicy";

beforeEach(() => {
  window.location.hash = "";
  localStorage.clear();
  updateAppSettings({
    autoSaveEnabled: false,
    autoSaveIdleSec: 10,
    checkpointIntervalMin: 30,
  });
});

afterEach(() => {
  vi.useRealTimers();
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

describe("auto-save settings semantics", () => {
  it("can disable idle saves while keeping exit saves enabled", () => {
    expect(AUTO_SAVE_IDLE_SEC_OPTIONS).toContain(0);

    updateAppSettings({ autoSaveEnabled: false });
    expect(isAutoSaveOnExitActive()).toBe(false);
    expect(isIdleAutoSaveActive()).toBe(false);

    updateAppSettings({ autoSaveEnabled: true, autoSaveIdleSec: 0 });
    expect(getAppSettings().autoSaveIdleSec).toBe(0);
    expect(isAutoSaveOnExitActive()).toBe(true);
    expect(isIdleAutoSaveActive()).toBe(false);

    updateAppSettings({ autoSaveEnabled: true, autoSaveIdleSec: 5 });
    expect(isAutoSaveOnExitActive()).toBe(true);
    expect(isIdleAutoSaveActive()).toBe(true);
  });
});

describe("idle timer settings refresh", () => {
  it("restarts the pending idle timer when autoSaveIdleSec changes", () => {
    vi.useFakeTimers();
    const fileId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    updateAppSettings({ autoSaveEnabled: true, autoSaveIdleSec: 10 });
    const trigger = vi.fn();
    const unregister = registerAutoSaveTrigger(trigger);
    window.location.hash = `#file=${fileId}`;
    FileSyncState.setDraftHash(fileId, "draft");
    FileSyncState.setBaselineHash(fileId, "baseline");

    notifyEdit();
    vi.advanceTimersByTime(5_000);
    updateAppSettings({ autoSaveIdleSec: 60 });

    vi.advanceTimersByTime(10_000);
    expect(trigger).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50_000);
    expect(trigger).toHaveBeenCalledTimes(1);

    unregister();
  });

  it("clears the pending idle timer when idle auto-save is disabled", () => {
    vi.useFakeTimers();
    updateAppSettings({ autoSaveEnabled: true, autoSaveIdleSec: 10 });
    const trigger = vi.fn();
    const unregister = registerAutoSaveTrigger(trigger);
    window.location.hash = "#file=a1b2c3d4-e5f6-7890-abcd-ef1234567890";

    notifyEdit();
    updateAppSettings({ autoSaveIdleSec: 0 });

    vi.advanceTimersByTime(15_000);
    expect(trigger).not.toHaveBeenCalled();

    unregister();
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
    window.location.hash = "#file=a1b2c3d4-e5f6-7890-abcd-ef1234567890";

    notifyEdit();
    vi.advanceTimersByTime(10_000);
    expect(trigger).toHaveBeenCalledTimes(1);

    expect(rearmDeferredAutoSave()).toBe(true);
    vi.advanceTimersByTime(9_999);
    expect(trigger).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(trigger).toHaveBeenCalledTimes(2);

    unregister();
  });

  it("can clear a deferred auto-save without rearming it", () => {
    vi.useFakeTimers();
    updateAppSettings({ autoSaveEnabled: true, autoSaveIdleSec: 10 });
    const unregister = registerAutoSaveTrigger(() => "deferred");
    window.location.hash = "#file=a1b2c3d4-e5f6-7890-abcd-ef1234567890";

    notifyEdit();
    vi.advanceTimersByTime(10_000);
    clearDeferredAutoSave();

    expect(rearmDeferredAutoSave()).toBe(false);

    unregister();
  });

  it("does not arm idle auto-save on settings change when file has no unsaved changes", () => {
    vi.useFakeTimers();
    window.location.hash = "#file=a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const trigger = vi.fn();
    const unregister = registerAutoSaveTrigger(trigger);

    updateAppSettings({ autoSaveEnabled: true, autoSaveIdleSec: 10 });

    vi.advanceTimersByTime(10_000);
    expect(trigger).not.toHaveBeenCalled();

    unregister();
  });

  it("arms idle auto-save on settings change when file has unsaved changes", () => {
    vi.useFakeTimers();
    const fileId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    window.location.hash = `#file=${fileId}`;
    FileSyncState.setDraftHash(fileId, "draft-hash");
    FileSyncState.setBaselineHash(fileId, "baseline-hash");
    const trigger = vi.fn();
    const unregister = registerAutoSaveTrigger(trigger);

    updateAppSettings({ autoSaveEnabled: true, autoSaveIdleSec: 10 });

    vi.advanceTimersByTime(10_000);
    expect(trigger).toHaveBeenCalledTimes(1);

    unregister();
  });
});

describe("idle auto-save rearm policy", () => {
  const fileId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

  beforeEach(() => {
    window.location.hash = `#file=${fileId}`;
    localStorage.clear();
    updateAppSettings({ autoSaveEnabled: true, autoSaveIdleSec: 10 });
  });

  it("only rearms for the active hash file with unsaved changes", () => {
    FileSyncState.setDraftHash(fileId, "draft");
    FileSyncState.setBaselineHash(fileId, "baseline");

    expect(fileNeedsIdleAutoSave(fileId)).toBe(true);
    expect(shouldRearmIdleAutoSave(fileId)).toBe(true);
    expect(shouldRearmIdleAutoSave("other-file-id")).toBe(false);

    window.location.hash = "#file=other-file-id";
    expect(shouldRearmIdleAutoSave(fileId)).toBe(false);
  });

  it("rearms cached background panes when allowInactiveFile is set", () => {
    FileSyncState.setDraftHash(fileId, "draft");
    FileSyncState.setBaselineHash(fileId, "baseline");

    window.location.hash = "#file=other-file-id";
    expect(shouldRearmIdleAutoSave(fileId)).toBe(false);
    expect(
      shouldRearmIdleAutoSave(fileId, { allowInactiveFile: true }),
    ).toBe(true);
  });

  it("rearmIdleAutoSaveIfNeeded starts the global idle timer", () => {
    vi.useFakeTimers();
    FileSyncState.setDraftHash(fileId, "draft");
    FileSyncState.setBaselineHash(fileId, "baseline");
    const trigger = vi.fn();
    const unregister = registerAutoSaveTrigger(trigger);

    expect(rearmIdleAutoSaveIfNeeded(fileId)).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(trigger).toHaveBeenCalledTimes(1);

    unregister();
  });
});
