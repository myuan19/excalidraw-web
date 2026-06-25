import { describe, expect, it } from "vitest";

import { shouldSuppressMindMapDirtyState } from "./mindMapDirtyStatePolicy";

describe("shouldSuppressMindMapDirtyState", () => {
  it("suppresses non-user dirty noise while hydrating", () => {
    expect(
      shouldSuppressMindMapDirtyState({ hydrating: true, userEdit: false }),
    ).toBe(true);
  });

  it("keeps real user edits during hydrate settle", () => {
    expect(
      shouldSuppressMindMapDirtyState({ hydrating: true, userEdit: true }),
    ).toBe(false);
  });

  it("does not suppress dirty state after hydrate settles", () => {
    expect(
      shouldSuppressMindMapDirtyState({ hydrating: false, userEdit: false }),
    ).toBe(false);
  });
});
