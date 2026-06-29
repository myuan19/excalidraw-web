import { describe, expect, it, vi } from "vitest";

import {
  applyDesktopGpuSwitches,
  resolveDesktopGpuSwitches,
} from "./desktopGpuPolicy.mjs";

describe("desktopGpuPolicy", () => {
  it("includes d3d11 ANGLE only on win32", () => {
    const win = resolveDesktopGpuSwitches({ platform: "win32", env: {} });
    const mac = resolveDesktopGpuSwitches({ platform: "darwin", env: {} });

    expect(win.enabled).toBe(true);
    expect(win.switches.map((s) => s.key)).toContain("use-angle");
    expect(mac.switches.map((s) => s.key)).not.toContain("use-angle");
  });

  it("always forces GPU rasterization and ignores the blocklist", () => {
    const policy = resolveDesktopGpuSwitches({ platform: "linux", env: {} });
    const keys = policy.switches.map((s) => s.key);

    expect(keys).toContain("ignore-gpu-blocklist");
    expect(keys).toContain("enable-gpu-rasterization");
    expect(keys).toContain("enable-features");
  });

  it("disables all tweaks via EDITORHUB_DESKTOP_GPU_TWEAKS=0", () => {
    const policy = resolveDesktopGpuSwitches({
      platform: "win32",
      env: { EDITORHUB_DESKTOP_GPU_TWEAKS: "0" },
    });

    expect(policy.enabled).toBe(false);
    expect(policy.reason).toBe("disabled-by-env");
    expect(policy.switches).toEqual([]);
  });

  it("applies switches to a commandLine and reports the applied list", () => {
    const appendSwitch = vi.fn();
    const result = applyDesktopGpuSwitches(
      { appendSwitch },
      { platform: "win32", env: {} },
    );

    expect(appendSwitch).toHaveBeenCalledWith("ignore-gpu-blocklist");
    expect(appendSwitch).toHaveBeenCalledWith("use-angle", "d3d11");
    expect(result.applied).toContain("use-angle=d3d11");
    expect(result.applied).toContain("ignore-gpu-blocklist");
  });

  it("tolerates a missing commandLine without throwing", () => {
    const result = applyDesktopGpuSwitches(null, { platform: "win32", env: {} });
    expect(result.applied).toEqual([]);
    expect(result.enabled).toBe(true);
  });
});
