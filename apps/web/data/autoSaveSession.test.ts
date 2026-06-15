import { describe, expect, it } from "vitest";

import {
  isAutoSaveEligibleFile,
  isAutoSaveLabel,
  resolveAutoSaveArchiveLabel,
} from "./autoSaveSession";

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

describe("resolveAutoSaveArchiveLabel", () => {
  it("labels idle and visibility saves as automatic archive entries", () => {
    const idleLabel = resolveAutoSaveArchiveLabel("auto");
    const visibilityLabel = resolveAutoSaveArchiveLabel("visibility");

    expect(idleLabel).toBeTruthy();
    expect(visibilityLabel).toBeTruthy();
    expect(isAutoSaveLabel(idleLabel ?? "")).toBe(true);
    expect(isAutoSaveLabel(visibilityLabel ?? "")).toBe(true);
  });

  it("keeps user initiated saves as normal history entries", () => {
    expect(resolveAutoSaveArchiveLabel("toolbar")).toBeUndefined();
    expect(resolveAutoSaveArchiveLabel("hotkey")).toBeUndefined();
    expect(resolveAutoSaveArchiveLabel("home")).toBeUndefined();
    expect(resolveAutoSaveArchiveLabel("sidebar")).toBeUndefined();
  });
});
