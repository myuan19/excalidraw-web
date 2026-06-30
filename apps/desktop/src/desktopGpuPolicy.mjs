/**
 * 桌面端 GPU / 呈现策略。
 *
 * 原则：让 Chromium 自带的 GPU 能力检测（blocklist + 驱动探测）来决定“支持就开、
 * 不支持就退化软件合成”，我们只“请求”特性、不“强行无视检测”。
 *
 * 历史教训：早期为修集显拖动卡顿曾注入 `ignore-gpu-blocklist` 强行无视黑名单
 * 开启硬件加速。但这条会越过 Chromium 的安全判定，在被列入黑名单的驱动/时序下
 * 触发渲染进程原生崩溃（render-process-gone, exitCode 0x80000003），表现为启动
 * 时偶发白屏 / “桌面端启动失败 ERR_FAILED”。现代 Intel 驱动默认已走 D3D11 +
 * DirectComposition + overlays，故移除该强制项，回归“由检测决定”。
 *
 * 保留的开关都是“请求特性、仍由 Chromium 按 GPU 可用性 gate”：
 * 即支持则启用、不支持则自动忽略，不会强行越过检测。
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
    // 请求 GPU 光栅；Chromium 仍按 GPU 可用性 gate（不可用则自动忽略）。
    { key: "enable-gpu-rasterization", value: null },
  ];

  // Windows：显式选 D3D11 ANGLE 后端（与现代 Chromium 默认一致），
  // 仅在 GPU 可用时生效，不会越过 blocklist 强开。
  if (platform === "win32") {
    switches.push({ key: "use-angle", value: "d3d11" });
  }

  // 2D canvas 离屏 GPU 光栅，减轻 Excalidraw 画布呈现压力；同样受 GPU 能力 gate。
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
