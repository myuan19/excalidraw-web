/**
 * Excalidraw 拖动卡顿诊断：主进程侧资源采样。
 *
 * 渲染端在 pointer down/up 通过 IPC（editorhub:dragPerf）通知拖动开始/结束。
 * 主进程在拖动窗口内以固定间隔调用 app.getAppMetrics()，聚合各进程
 * （Browser / GPU / Renderer）的 CPU 峰值与均值、内存峰值，结束时写入
 * desktop-op.log。配合渲染端 rAF 帧率统计即可判断卡顿来源：
 *
 * - GPU 进程 CPU 高 + 渲染端帧间隔大 → 合成/GPU 受限（常见于软件渲染）
 * - Renderer 进程 CPU 高 → Excalidraw 自身渲染开销
 * - Browser(主)进程 CPU 高 → 主进程/IPC 阻塞
 *
 * 在 desktop-op.log 中 grep：`drag.perf`。
 */

const SAMPLE_INTERVAL_MS = 200;
const MAX_SAMPLES = 600; // ~2 分钟保护上限

function classifyProcessType(metric) {
  const type = String(metric?.type ?? "Unknown");
  if (type === "Browser") {
    return "browser";
  }
  if (type === "GPU") {
    return "gpu";
  }
  if (type === "Tab" || type === "Renderer") {
    return "renderer";
  }
  if (type === "Utility") {
    return "utility";
  }
  return type.toLowerCase();
}

function createAccumulator() {
  return { peakCpu: 0, sumCpu: 0, samples: 0, peakMemKb: 0 };
}

export function createDragPerfSampler({ getAppMetrics, writeLog, now = () => Date.now() }) {
  let timer = null;
  let session = null;

  function takeSample() {
    if (!session) {
      return;
    }
    let metrics;
    try {
      metrics = getAppMetrics() ?? [];
    } catch {
      return;
    }
    session.sampleCount += 1;
    for (const metric of metrics) {
      const bucketKey = classifyProcessType(metric);
      const bucket =
        session.buckets.get(bucketKey) ?? createAccumulator();
      const cpu = Math.max(0, Number(metric?.cpu?.percentCPUUsage ?? 0));
      const memKb = Math.max(0, Number(metric?.memory?.workingSetSize ?? 0));
      bucket.peakCpu = Math.max(bucket.peakCpu, cpu);
      bucket.sumCpu += cpu;
      bucket.samples += 1;
      bucket.peakMemKb = Math.max(bucket.peakMemKb, memKb);
      session.buckets.set(bucketKey, bucket);
    }
    if (session.sampleCount >= MAX_SAMPLES) {
      stop({ reason: "max-samples" });
    }
  }

  function start(payload = {}) {
    // 已有未结束会话：先结算，避免泄漏。
    if (session) {
      stop({ reason: "superseded" });
    }
    session = {
      id: Number(payload.sessionId ?? 0),
      startedAt: now(),
      sampleCount: 0,
      buckets: new Map(),
    };
    // 首次调用用于重置 Electron 内部 CPU 计数基线。
    try {
      getAppMetrics();
    } catch {
      /* ignore */
    }
    timer = setInterval(takeSample, SAMPLE_INTERVAL_MS);
    if (typeof timer?.unref === "function") {
      timer.unref();
    }
  }

  function stop(payload = {}) {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (!session) {
      return;
    }
    const current = session;
    session = null;
    const durationMs = Math.round(now() - current.startedAt);
    const processes = {};
    for (const [key, acc] of current.buckets) {
      processes[key] = {
        peakCpu: Math.round(acc.peakCpu),
        avgCpu: acc.samples > 0 ? Math.round(acc.sumCpu / acc.samples) : 0,
        peakMemMb: Math.round(acc.peakMemKb / 1024),
      };
    }
    writeLog("drag.perf", "main.resource", {
      sessionId: current.id,
      durationMs,
      sampleCount: current.sampleCount,
      reason: payload.reason ?? "renderer-end",
      // 渲染端在 end 时回传的真实帧率统计（若有）。
      raf: payload.raf ?? null,
      processes,
    });
  }

  function handle(payload = {}) {
    const phase = String(payload?.phase ?? "");
    if (phase === "start") {
      start(payload);
      return { ok: true };
    }
    if (phase === "end") {
      stop({ reason: payload.reason ?? "renderer-end", raf: payload.raf });
      return { ok: true };
    }
    return { ok: false };
  }

  return { handle, start, stop };
}
