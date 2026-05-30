import { describe, expect, it } from "vitest";

function hasSaveConflict(rowHash, expectedHash) {
  return (rowHash ?? null) !== (expectedHash ?? null);
}

describe("file save conflict contract", () => {
  it("flags mismatched expected hashes", () => {
    expect(hasSaveConflict("server-sha", "client-sha")).toBe(true);
    expect(hasSaveConflict("same-sha", "same-sha")).toBe(false);
    expect(hasSaveConflict(null, null)).toBe(false);
  });
});
