import { describe, expect, it } from "vitest";

import { isContentHashArchived } from "./archiveVersionMatch";

describe("isContentHashArchived", () => {
  it("matches when any archive shares the same content hash", () => {
    expect(
      isContentHashArchived(
        [
          {
            id: "a1",
            label: "checkpoint:manual",
            created_at: "2026-01-01T00:00:00.000Z",
            content_sha256: "sha-a",
          },
          {
            id: "a2",
            label: "checkpoint:interval",
            created_at: "2026-01-02T00:00:00.000Z",
            content_sha256: "sha-b",
          },
        ],
        "sha-b",
      ),
    ).toBe(true);
  });

  it("returns false when hash is missing or unmatched", () => {
    expect(isContentHashArchived([], "sha-a")).toBe(false);
    expect(
      isContentHashArchived(
        [
          {
            id: "a1",
            label: "checkpoint:manual",
            created_at: "2026-01-01T00:00:00.000Z",
            content_sha256: "sha-a",
          },
        ],
        "sha-other",
      ),
    ).toBe(false);
  });
});
