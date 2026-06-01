import { describe, expect, it } from "vitest";

import { createLocalDraftFileId, isLocalDraftFileId } from "./localDraftFileId";

describe("localDraftFileId", () => {
  it("creates ids with local-draft prefix", () => {
    const id = createLocalDraftFileId();
    expect(isLocalDraftFileId(id)).toBe(true);
    expect(id.startsWith("local-draft:")).toBe(true);
  });
});
