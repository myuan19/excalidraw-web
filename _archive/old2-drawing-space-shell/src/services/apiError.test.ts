import { describe, expect, it } from "vitest";
import { ApiError, isFileConflictError, parseApiErrorBody } from "./apiError";

describe("apiError", () => {
  it("detects file conflict errors", () => {
    const error = new ApiError("conflict", 409, { error: "file_conflict" });
    expect(isFileConflictError(error)).toBe(true);
    expect(isFileConflictError(new ApiError("other", 500))).toBe(false);
  });

  it("parses json api bodies", () => {
    const parsed = parseApiErrorBody(
      JSON.stringify({ error: "file_conflict", message: "changed" }),
      "application/json",
    );
    expect(parsed.message).toBe("changed");
    expect(parsed.body?.error).toBe("file_conflict");
  });
});
