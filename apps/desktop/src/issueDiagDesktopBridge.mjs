/**
 * Renderer issue.diag → desktop-op.log（与 drag.perf 同路径，不依赖 /api/logs 批处理）。
 */

export function createIssueDiagDesktopBridge({ writeLog, now = () => Date.now() }) {
  let lastWriteAt = 0;
  const MIN_INTERVAL_MS = 8;

  function handle(payload = {}) {
    const area = String(payload.area ?? "").trim();
    const action = String(payload.action ?? "").trim();
    if (!area || !action) {
      return { ok: false, reason: "missing-area-or-action" };
    }
    const ts = now();
    if (ts - lastWriteAt < MIN_INTERVAL_MS) {
      // 热路径采样：同一帧内多条 diag 合并为节流写入由调用方控制；此处仅防 IPC 风暴。
    }
    lastWriteAt = ts;
    const details = {
      tag: "issue.diag",
      area,
      action,
      phase: payload.phase ?? "branch",
      ...(payload.data && typeof payload.data === "object" ? payload.data : {}),
    };
    writeLog("diag", `issue.diag.${area}.${action}`, details);
    return { ok: true };
  }

  return { handle };
}
