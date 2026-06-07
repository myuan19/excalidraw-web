import { describe, expect, it } from "vitest";

import { isAutoSaveEligibleFile } from "./autoSaveSession";

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
