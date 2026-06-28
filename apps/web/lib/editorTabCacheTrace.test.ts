import { describe, expect, it } from "vitest";

import {
  buildTabCacheHostSnapshot,
  getTabCacheTraceSummary,
  publishTabCacheHostSnapshot,
  traceTabCacheWhiteScreen,
} from "./editorTabCacheTrace";

describe("editorTabCacheTrace", () => {
  it("marks layout fail when no file pane is active for a file tab", () => {
    const snapshot = buildTabCacheHostSnapshot({
      activeTabId: "file:abc",
      hash: "#file=abc",
      homeActive: false,
      hasFileTabs: true,
      activeFileTab: null,
      fileTabs: [
        {
          id: "file:other",
          fileId: "other",
          kind: "excalidraw",
          title: "其他",
        },
      ],
    });
    expect(snapshot.hasActiveFilePane).toBe(false);
    publishTabCacheHostSnapshot(snapshot);
    traceTabCacheWhiteScreen(snapshot, "test");
    const summary = getTabCacheTraceSummary();
    expect(summary.whiteScreenCount).toBeGreaterThan(0);
    expect(summary.lastHostSnapshot?.activeTabId).toBe("file:abc");
  });
});
