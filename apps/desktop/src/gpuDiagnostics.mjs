/**
 * 桌面端 GPU 呈现路径诊断日志。
 *
 * 与 Electron 解耦：通过依赖注入接收 getFeatureStatus / getGpuInfo / hasSwitch /
 * writeLog，便于单测。在 desktop-op.log 中 grep `drag.perf.gpu`。
 *
 * GPU 进程初始化需要时间，启动即采一次（可能尚未初始化），数秒后再采一次
 * 准确值（phase=post-init），用于核对 GPU 开关是否真正恢复了 DirectComposition。
 */

function serializeError(error) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return error;
}

/**
 * 纯函数：从 getGPUInfo("complete") 结果提炼最能反映呈现路径健康度的字段。
 * @param {any} info
 */
export function summarizeGpuInfo(info) {
  const aux = info?.auxAttributes ?? {};
  const overlay = aux.overlayInfo ?? {};
  return {
    glImplementationParts: aux.glImplementationParts ?? null,
    skiaBackendType: aux.skiaBackendType ?? null,
    inProcessGpu: aux.inProcessGpu ?? null,
    directComposition: overlay.directComposition ?? null,
    supportsOverlays: overlay.supportsOverlays ?? null,
    supportsD3dSharedImages: aux.supportsD3dSharedImages ?? null,
    activeGpu:
      (Array.isArray(info?.gpuDevice) ? info.gpuDevice : []).find(
        (device) => device?.active,
      ) ?? null,
  };
}

/**
 * @param {{
 *   getFeatureStatus: () => unknown,
 *   getGpuInfo: (level: "basic" | "complete") => Promise<unknown>,
 *   hasSwitch?: (name: string) => boolean,
 *   writeLog: (action: string, details: Record<string, unknown>) => void,
 *   postInitDelayMs?: number,
 *   schedule?: (fn: () => void, ms: number) => unknown,
 * }} deps
 */
export function createGpuDiagnostics(deps) {
  const {
    getFeatureStatus,
    getGpuInfo,
    hasSwitch,
    writeLog,
    postInitDelayMs = 4000,
    schedule = (fn, ms) => setTimeout(fn, ms),
  } = deps;

  function logFeatureStatus(appliedGpuSwitches) {
    try {
      writeLog("gpu-feature-status", {
        appliedGpuSwitches,
        hardwareAccelerationDisabled:
          typeof hasSwitch === "function" ? hasSwitch("disable-gpu") : null,
        featureStatus: getFeatureStatus(),
      });
    } catch (error) {
      writeLog("gpu-feature-status-failed", { error: serializeError(error) });
    }
  }

  function logInfoSnapshot(phase) {
    return Promise.resolve()
      .then(() => getGpuInfo("complete"))
      .then((info) => {
        writeLog("gpu-info", {
          phase,
          summary: summarizeGpuInfo(info),
          info,
        });
      })
      .catch((error) => {
        writeLog("gpu-info-failed", { phase, error: serializeError(error) });
      });
  }

  /** 启动时调用：记录特性状态 + 启动快照 + 延迟后的准确快照。 */
  function log({ appliedGpuSwitches = [] } = {}) {
    logFeatureStatus(appliedGpuSwitches);
    void logInfoSnapshot("startup");
    schedule(() => {
      void logInfoSnapshot("post-init");
    }, postInitDelayMs);
  }

  return { log, logFeatureStatus, logInfoSnapshot };
}
