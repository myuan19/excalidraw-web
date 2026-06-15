import { describe, expect, it } from "vitest";

import {
  explainRefreshCacheOnOpen,
  shouldRefreshCacheOnOpen,
} from "./mindMapOpenSyncPolicy";

describe("shouldRefreshCacheOnOpen", () => {
  it("skips refresh when user has unsaved changes", () => {
    expect(
      shouldRefreshCacheOnOpen({
        hasUnsavedChanges: true,
        remoteServerHash: "remote",
        cachedServerSha: "old",
        localServerHash: "old",
      }),
    ).toBe(false);
  });

  it("refreshes when remote hash differs from local pointer", () => {
    expect(
      shouldRefreshCacheOnOpen({
        hasUnsavedChanges: false,
        remoteServerHash: "remote-b",
        cachedServerSha: "remote-b",
        localServerHash: "remote-a",
      }),
    ).toBe(true);
  });

  it("refreshes when cache body sha is missing or stale", () => {
    expect(
      shouldRefreshCacheOnOpen({
        hasUnsavedChanges: false,
        remoteServerHash: "remote-b",
        cachedServerSha: null,
        localServerHash: "remote-b",
      }),
    ).toBe(true);
    expect(
      shouldRefreshCacheOnOpen({
        hasUnsavedChanges: false,
        remoteServerHash: "remote-b",
        cachedServerSha: "remote-a",
        localServerHash: "remote-b",
      }),
    ).toBe(true);
  });

  it("keeps cache when pointers and cache sha all match remote", () => {
    expect(
      shouldRefreshCacheOnOpen({
        hasUnsavedChanges: false,
        remoteServerHash: "remote-b",
        cachedServerSha: "remote-b",
        localServerHash: "remote-b",
      }),
    ).toBe(false);
  });

  it("explainRefreshCacheOnOpen returns actionable reasons", () => {
    expect(
      explainRefreshCacheOnOpen({
        hasUnsavedChanges: false,
        remoteServerHash: "remote-b",
        cachedServerSha: null,
        localServerHash: "remote-b",
      }),
    ).toEqual({ refresh: true, reason: "cache-sha-missing" });
  });
});
