import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDragPerfSampler } from "./dragPerfSampler.mjs";

describe("dragPerfSampler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function makeMetrics(samples) {
    let index = 0;
    return () => {
      const value = samples[Math.min(index, samples.length - 1)];
      index += 1;
      return value;
    };
  }

  it("aggregates peak/avg CPU and peak memory per process type at end", () => {
    const writeLog = vi.fn();
    let clock = 1000;
    const sampler = createDragPerfSampler({
      // 第一次调用是基线（被丢弃），之后是真正的采样。
      getAppMetrics: makeMetrics([
        [],
        [
          { type: "GPU", cpu: { percentCPUUsage: 40 }, memory: { workingSetSize: 102400 } },
          { type: "Tab", cpu: { percentCPUUsage: 10 }, memory: { workingSetSize: 204800 } },
        ],
        [
          { type: "GPU", cpu: { percentCPUUsage: 80 }, memory: { workingSetSize: 153600 } },
          { type: "Tab", cpu: { percentCPUUsage: 20 }, memory: { workingSetSize: 204800 } },
        ],
      ]),
      writeLog,
      now: () => clock,
    });

    sampler.start({ sessionId: 7 });
    clock = 1200;
    vi.advanceTimersByTime(200); // sample 1
    clock = 1400;
    vi.advanceTimersByTime(200); // sample 2
    clock = 1500;
    sampler.stop({ reason: "renderer-end", raf: { rafAvgFps: 30 } });

    expect(writeLog).toHaveBeenCalledTimes(1);
    const [event, action, details] = writeLog.mock.calls[0];
    expect(event).toBe("drag.perf");
    expect(action).toBe("main.resource");
    expect(details.sessionId).toBe(7);
    expect(details.sampleCount).toBe(2);
    expect(details.raf).toEqual({ rafAvgFps: 30 });
    expect(details.processes.gpu).toEqual({
      peakCpu: 80,
      avgCpu: 60,
      peakMemMb: 150,
    });
    expect(details.processes.renderer.peakCpu).toBe(20);
  });

  it("starting a new session settles the previous one", () => {
    const writeLog = vi.fn();
    const sampler = createDragPerfSampler({
      getAppMetrics: () => [],
      writeLog,
      now: () => 0,
    });

    sampler.start({ sessionId: 1 });
    sampler.start({ sessionId: 2 });

    expect(writeLog).toHaveBeenCalledTimes(1);
    expect(writeLog.mock.calls[0][2].reason).toBe("superseded");
  });

  it("handle() routes start/end phases", () => {
    const writeLog = vi.fn();
    const sampler = createDragPerfSampler({
      getAppMetrics: () => [],
      writeLog,
      now: () => 0,
    });

    expect(sampler.handle({ phase: "start", sessionId: 3 })).toEqual({ ok: true });
    expect(sampler.handle({ phase: "end" })).toEqual({ ok: true });
    expect(sampler.handle({ phase: "bogus" })).toEqual({ ok: false });
    expect(writeLog).toHaveBeenCalledTimes(1);
  });
});
