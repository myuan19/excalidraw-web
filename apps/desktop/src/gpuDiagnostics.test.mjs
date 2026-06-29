import { describe, expect, it, vi } from "vitest";

import { createGpuDiagnostics, summarizeGpuInfo } from "./gpuDiagnostics.mjs";

const SAMPLE_INFO = {
  auxAttributes: {
    glImplementationParts: "(gl=angle,angle=d3d11)",
    skiaBackendType: "Ganesh",
    inProcessGpu: false,
    supportsD3dSharedImages: true,
    overlayInfo: { directComposition: true, supportsOverlays: true },
  },
  gpuDevice: [
    { active: false, deviceString: "Microsoft Basic Render Driver" },
    { active: true, deviceString: "Intel(R) Iris(R) Xe Graphics" },
  ],
};

describe("summarizeGpuInfo", () => {
  it("extracts the present-path health fields", () => {
    const summary = summarizeGpuInfo(SAMPLE_INFO);

    expect(summary.directComposition).toBe(true);
    expect(summary.inProcessGpu).toBe(false);
    expect(summary.glImplementationParts).toBe("(gl=angle,angle=d3d11)");
    expect(summary.activeGpu?.deviceString).toBe("Intel(R) Iris(R) Xe Graphics");
  });

  it("returns null fields for empty info", () => {
    const summary = summarizeGpuInfo(undefined);
    expect(summary.directComposition).toBeNull();
    expect(summary.activeGpu).toBeNull();
  });
});

describe("createGpuDiagnostics", () => {
  it("logs feature status, startup and post-init snapshots", async () => {
    const writeLog = vi.fn();
    const scheduled = [];
    const diag = createGpuDiagnostics({
      getFeatureStatus: () => ({ gpu_compositing: "enabled" }),
      getGpuInfo: () => Promise.resolve(SAMPLE_INFO),
      hasSwitch: () => false,
      writeLog,
      schedule: (fn) => scheduled.push(fn),
    });

    diag.log({ appliedGpuSwitches: ["use-angle=d3d11"] });
    await Promise.resolve();
    await Promise.resolve();

    const actions = writeLog.mock.calls.map((c) => c[0]);
    expect(actions).toContain("gpu-feature-status");
    expect(actions).toContain("gpu-info");

    const featureCall = writeLog.mock.calls.find(
      (c) => c[0] === "gpu-feature-status",
    );
    expect(featureCall[1].appliedGpuSwitches).toEqual(["use-angle=d3d11"]);

    // post-init 快照尚未触发，直到 schedule 回调执行。
    expect(scheduled).toHaveLength(1);
    scheduled[0]();
    await Promise.resolve();
    await Promise.resolve();
    const phases = writeLog.mock.calls
      .filter((c) => c[0] === "gpu-info")
      .map((c) => c[1].phase);
    expect(phases).toContain("startup");
    expect(phases).toContain("post-init");
  });

  it("records a failure when getGpuInfo rejects", async () => {
    const writeLog = vi.fn();
    const diag = createGpuDiagnostics({
      getFeatureStatus: () => ({}),
      getGpuInfo: () => Promise.reject(new Error("gpu boom")),
      writeLog,
      schedule: () => {},
    });

    await diag.logInfoSnapshot("startup");

    const failCall = writeLog.mock.calls.find((c) => c[0] === "gpu-info-failed");
    expect(failCall).toBeTruthy();
    expect(failCall[1].error.message).toBe("gpu boom");
  });
});
