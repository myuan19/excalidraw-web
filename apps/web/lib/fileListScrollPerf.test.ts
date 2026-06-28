import { describe, expect, it } from "vitest";

import {
  getFileListScrollSummary,
  notifyFileListScrollActivity,
  recordFileListScrollContext,
} from "./fileListScrollPerf";

describe("fileListScrollPerf", () => {
  it("records listed vs dom card counts", () => {
    recordFileListScrollContext({
      listedFileCount: 240,
      domCardCount: 28,
      virtualized: true,
    });
    const summary = getFileListScrollSummary();
    expect(summary.lastListedFiles).toBe(240);
    expect(summary.lastDomCards).toBe(28);
    expect(summary.lastVirtualized).toBe(true);
  });

  it("no-ops scroll activity when monitoring disabled", () => {
    const before = getFileListScrollSummary().scrollSessions;
    notifyFileListScrollActivity();
    expect(getFileListScrollSummary().scrollSessions).toBe(before);
  });
});
