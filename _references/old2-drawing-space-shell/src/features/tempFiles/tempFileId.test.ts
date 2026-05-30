import { describe, expect, it } from "vitest";
import { createLocalTempFileId, isLocalTempFileId } from "./tempFileId";

describe("tempFileId", () => {
  it("creates ids with local-temp prefix", () => {
    const id = createLocalTempFileId();
    expect(isLocalTempFileId(id)).toBe(true);
    expect(id.startsWith("local-temp:")).toBe(true);
  });

  it("rejects server-like ids", () => {
    expect(isLocalTempFileId("550e8400-e29b-41d4-a716-446655440000")).toBe(false);
  });
});
