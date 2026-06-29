/**
 * 桌面端 GPU / 呈现策略。
 *
 * 背景（见 desktop-op.log 中 `drag.perf`）：Excalidraw 拖动在桌面端只有 ~22fps，
 * 而 renderer/GPU CPU 近乎为 0，启动 GPU 信息显示 inProcessGpu=true、
 * directComposition=false、overlays=false —— 即 Chromium 把 Intel 集显判进
 * GPU blocklist，退化为进程内 / 软件合成路径，主线程在等呈现而非在计算。
 *
 * 这里把“注入哪些 Chromium 开关”的决策收敛为纯函数，应用器只依赖一个
 * 具备 appendSwitch 的对象（Electron 的 app.commandLine 或测试替身），与
 * Electron 运行时解耦、可单测。开关必须在 app ready 之前应用。
 *
 * 用 EDITORHUB_DESKTOP_GPU_TWEAKS=0 可整组关闭，便于做 A/B 对比。
 */

export const DESKTOP_GPU_TWEAKS_ENV = "EDITORHUB_DESKTOP_GPU_TWEAKS";

/** @typedef {{ key: string, value: string | null }} GpuSwitch */

function isDisabledByEnv(env) {
  return String(env?.[DESKTOP_GPU_TWEAKS_ENV] ?? "").trim() === "0";
}

/**
 * 纯函数：依据平台与环境，决定应注入的 Chromium GPU 开关。
 * @param {{ platform?: string, env?: Record<string, string | undefined> }} [options]
 * @returns {{ enabled: boolean, reason: string, switches: GpuSwitch[] }}
 */
export function resolveDesktopGpuSwitches(options = {}) {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;

  if (isDisabledByEnv(env)) {
    return { enabled: false, reason: "disabled-by-env", switches: [] };
  }

  /** @type {GpuSwitch[]} */
  const switches = [
    // 旧 / 集成显卡常被 blocklist 拦截，强制启用硬件 GPU 合成与光栅。
    { key: "ignore-gpu-blocklist", value: null },
    { key: "enable-gpu-rasterization", value: null },
  ];

  // Windows：走 D3D11 ANGLE 硬件后端，恢复 DirectComposition 呈现路径，
  // 避免 gl=none / angle=none 的回退。
  if (platform === "win32") {
    switches.push({ key: "use-angle", value: "d3d11" });
  }

  // 2D canvas 离屏 GPU 光栅，减轻 Excalidraw 画布呈现压力。
  switches.push({ key: "enable-features", value: "CanvasOopRasterization" });

  return { enabled: true, reason: "enabled", switches };
}

/**
 * 将策略应用到 commandLine（仅依赖 appendSwitch），返回已应用清单（用于日志）。
 * @param {{ appendSwitch: (key: string, value?: string) => void } | null | undefined} commandLine
 * @param {{ platform?: string, env?: Record<string, string | undefined> }} [options]
 * @returns {{ enabled: boolean, reason: string, applied: string[] }}
 */
export function applyDesktopGpuSwitches(commandLine, options = {}) {
  const policy = resolveDesktopGpuSwitches(options);
  /** @type {string[]} */
  const applied = [];

  if (!commandLine || typeof commandLine.appendSwitch !== "function") {
    return { enabled: policy.enabled, reason: policy.reason, applied };
  }

  for (const { key, value } of policy.switches) {
    if (value == null) {
      commandLine.appendSwitch(key);
      applied.push(key);
    } else {
      commandLine.appendSwitch(key, value);
      applied.push(`${key}=${value}`);
    }
  }

  return { enabled: policy.enabled, reason: policy.reason, applied };
}
