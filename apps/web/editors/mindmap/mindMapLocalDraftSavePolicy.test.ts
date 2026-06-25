import { describe, expect, it } from "vitest";

import {
  shouldFormalizeMindMapLocalDraftSave,
  shouldRequestNativeSnapshotForMindMapLocalDraftAutoSave,
} from "./mindMapLocalDraftSavePolicy";

describe("shouldFormalizeMindMapLocalDraftSave", () => {
  it("promotes local drafts on request-backed automatic, manual, and exit saves", () => {
    expect(shouldFormalizeMindMapLocalDraftSave("auto", true)).toBe(true);
    expect(shouldFormalizeMindMapLocalDraftSave("manual", true)).toBe(true);
    expect(shouldFormalizeMindMapLocalDraftSave("exit", true)).toBe(true);
  });

  it("does not promote draft-push, thumbnail, or visibility-only saves directly", () => {
    expect(shouldFormalizeMindMapLocalDraftSave("auto", false)).toBe(false);
    expect(shouldFormalizeMindMapLocalDraftSave("thumbnail", true)).toBe(false);
    expect(shouldFormalizeMindMapLocalDraftSave("visibility", false)).toBe(false);
  });
});

describe("shouldRequestNativeSnapshotForMindMapLocalDraftAutoSave", () => {
  it("requests a native snapshot for idle autosave draft pushes", () => {
    expect(
      shouldRequestNativeSnapshotForMindMapLocalDraftAutoSave("auto", false),
    ).toBe(true);
    expect(
      shouldRequestNativeSnapshotForMindMapLocalDraftAutoSave("auto", true),
    ).toBe(false);
    expect(
      shouldRequestNativeSnapshotForMindMapLocalDraftAutoSave("manual", false),
    ).toBe(false);
  });
});
