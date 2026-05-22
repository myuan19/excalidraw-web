import { describe, expect, it } from "vitest";
import {
  shouldFetchServerAfterCachedMindMapOpen,
  shouldOpenCachedMindMapFirst,
} from "./mindMapOpenState";

describe("mindMapOpenState", () => {
  it("opens cached document first when available", () => {
    expect(shouldOpenCachedMindMapFirst({ hasCachedDocument: true })).toBe(true);
    expect(shouldOpenCachedMindMapFirst({ hasCachedDocument: false })).toBe(false);
  });

  it("fetches server after cached open only when hashes differ and no local edits", () => {
    expect(shouldFetchServerAfterCachedMindMapOpen({
      hasUnsavedChanges: true,
      localServerHash: "a",
      remoteServerHash: "b",
    })).toBe(false);
    expect(shouldFetchServerAfterCachedMindMapOpen({
      hasUnsavedChanges: false,
      localServerHash: "a",
      remoteServerHash: null,
    })).toBe(false);
    expect(shouldFetchServerAfterCachedMindMapOpen({
      hasUnsavedChanges: false,
      localServerHash: "a",
      remoteServerHash: "b",
    })).toBe(true);
  });
});
