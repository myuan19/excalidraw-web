import { afterEach, describe, expect, it } from "vitest";

import {
  getThumbPipelineTraceSummary,
  nextThumbPipelineTick,
  traceThumbFetchEnd,
  traceThumbFetchStart,
} from "./thumbPipelineTrace";

describe("thumbPipelineTrace", () => {
  afterEach(() => {
    traceThumbFetchEnd({
      fileId: "reset-file-id",
      tick: 0,
      outcome: "apply",
      ms: 1,
      svgLen: 10,
    });
  });

  it("increments pipeline tick sequence", () => {
    const a = nextThumbPipelineTick();
    const b = nextThumbPipelineTick();
    expect(b).toBe(a + 1);
  });

  it("records fetch stats in summary", () => {
    const tick = nextThumbPipelineTick();
    traceThumbFetchStart({
      fileId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      tick,
      cacheKey: "sha-1",
      contentSha8: "sha-1",
      alreadyInflight: false,
    });
    traceThumbFetchEnd({
      fileId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      tick,
      outcome: "apply",
      ms: 12,
      svgLen: 100,
    });
    const summary = getThumbPipelineTraceSummary();
    expect(summary.fetchStatsTop).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fileId8: "aaaaaaaa", starts: 1 }),
      ]),
    );
  });
});
