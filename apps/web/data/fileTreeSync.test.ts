import { describe, expect, it } from "vitest";

import {
  deriveCatalogScanNotice,
  fingerprintFileTree,
  mergeExpandedFolderState,
} from "./fileTreeSync";
import type { FileTreeResponse } from "./ServerSync";

function emptyTree(
  overrides: Partial<FileTreeResponse> = {},
): FileTreeResponse {
  return {
    folders: [],
    files: [],
    ...overrides,
  };
}

describe("fileTreeSync", () => {
  it("fingerprint changes when tree shape or scan progress changes", () => {
    const base = emptyTree({
      files: [
        {
          id: "a",
          name: "a",
          created_at: "1",
          updated_at: "1",
          has_thumbnail: false,
        },
      ],
    });
    const fp0 = fingerprintFileTree(base);
    const fp1 = fingerprintFileTree(
      emptyTree({
        files: [
          {
            id: "a",
            name: "a",
            created_at: "1",
            updated_at: "2",
            has_thumbnail: true,
          },
        ],
      }),
    );
    const fp2 = fingerprintFileTree(
      emptyTree({
        scan: { state: "running", running: true, processed: 48 },
        folders: [{ id: "f1", name: "x", created_at: "1", updated_at: "1" }],
      }),
    );
    expect(fp0).not.toBe(fp1);
    const fpThumbOnly = fingerprintFileTree(
      emptyTree({
        files: [
          {
            id: "a",
            name: "a",
            created_at: "1",
            updated_at: "1",
            has_thumbnail: true,
          },
        ],
      }),
    );
    expect(fp0).toBe(fpThumbOnly);
    expect(fp1).not.toBe(fp2);
  });

  it("deriveCatalogScanNotice maps scan states", () => {
    expect(
      deriveCatalogScanNotice({ state: "running", running: true }),
    ).toContain("索引");
    expect(deriveCatalogScanNotice({ state: "error", error: "boom" })).toBe(
      "boom",
    );
    expect(deriveCatalogScanNotice({ state: "idle" })).toBeNull();
  });

  it("mergeExpandedFolderState preserves prior keys and returns same ref when unchanged", () => {
    const prev = { a: true, b: false };
    const folders = [
      { id: "a", name: "A", created_at: "1", updated_at: "1" },
      { id: "c", name: "C", created_at: "1", updated_at: "1" },
    ];
    const next = mergeExpandedFolderState(prev, folders);
    expect(next).toEqual({ a: true });
    const again = mergeExpandedFolderState(next, folders);
    expect(again).toBe(next);
  });
});
