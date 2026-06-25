import {
  classifyMindMapIframeFailure,
  isAppReadyPhase,
  isBridgeReadyPhase,
  MINDMAP_APP_INIT_TIMEOUT_MS,
  MINDMAP_BRIDGE_MOUNT_TIMEOUT_MS,
  MINDMAP_HOST_SOURCE,
  MINDMAP_MAX_CHUNK_RELOAD_ATTEMPTS,
  type MindMapHostBridgePhase,
  type MindMapIframeFailureClassification,
  type MindMapIframeFailurePayload,
  type NativeMindMapBridgePayload,
  type NativeMindMapMessage,
} from "./mindMapBridgeProtocol";
import {
  describeMindMapBridgeState,
  isMindMapIframeDocumentComplete,
  NATIVE_MINDMAP_URL,
  resolveNativePostMessageTargetOrigin,
} from "./mindMapBridgeOrigins";
import { debugMindMapBridge, warnMindMapBridge } from "./mindMapBridgeDebug";
import { findFirstRichMindMapNodeSummary } from "./mindMapPersistDebug";

export type MindMapHostBridgeSnapshot = {
  phase: MindMapHostBridgePhase;
  bootKey: number;
  learnedOrigin: string | null;
  isBridgeReady: boolean;
  isAppReady: boolean;
  failure: MindMapIframeFailureClassification | null;
};

export type MindMapHostBridgeCallbacks = {
  onSnapshot: (snapshot: MindMapHostBridgeSnapshot) => void;
  onStatus?: (status: string) => void;
  onError?: (error: string | null) => void;
  onNativeReady?: (ready: boolean) => void;
  onBootKeyChange?: (bootKey: number) => void;
};

export type MindMapHostBridgeOptions = {
  getIframe: () => HTMLIFrameElement | null;
  callbacks: MindMapHostBridgeCallbacks;
  debugOpen?: (label: string, data?: Record<string, unknown>) => void;
};

export class MindMapHostBridge {
  private phase: MindMapHostBridgePhase = "idle";
  private bootKey = 0;
  private learnedOrigin: string | null = null;
  private pendingPayload: NativeMindMapBridgePayload | null = null;
  private chunkReloadAttempts = 0;
  private mountTimeoutId: number | null = null;
  private initTimeoutId: number | null = null;
  private lastFailure: MindMapIframeFailureClassification | null = null;
  private sessionStartMs = 0;

  constructor(private readonly options: MindMapHostBridgeOptions) {}

  getSnapshot(): MindMapHostBridgeSnapshot {
    return {
      phase: this.phase,
      bootKey: this.bootKey,
      learnedOrigin: this.learnedOrigin,
      isBridgeReady: isBridgeReadyPhase(this.phase),
      isAppReady: isAppReadyPhase(this.phase),
      failure: this.lastFailure,
    };
  }

  beginSession(): void {
    this.sessionStartMs = performance.now();
    this.clearTimers();
    this.phase = "idle";
    this.learnedOrigin = null;
    this.pendingPayload = null;
    this.chunkReloadAttempts = 0;
    this.lastFailure = null;
    this.deleteBridgeReadyDataset();
    this.emitSnapshot();
    this.options.callbacks.onError?.(null);
    this.options.callbacks.onNativeReady?.(false);
    this.options.callbacks.onStatus?.("加载中…");
    this.transition("mounting");
  }

  dispose(): void {
    this.clearTimers();
    this.phase = "idle";
  }

  publishDocument(
    payload: NativeMindMapBridgePayload,
    reason: string,
  ): void {
    this.pendingPayload = payload;
    this.debugOpen("publishMindMapDataToNative", {
      reason,
      phase: this.phase,
      rootChildren: payload.mindMapData.root?.children?.length ?? 0,
      sampleNode: findFirstRichMindMapNodeSummary(payload.mindMapData),
    });

    if (this.phase === "app_ready") {
      this.postToNative("setMindMapData", payload);
      this.options.callbacks.onNativeReady?.(true);
      return;
    }

    if (this.phase === "bridge_ready") {
      this.sendInitMindMap(reason);
      return;
    }

    // mounting | init_sent | failed — keep payload until runtime reaches bridge_ready / app_ready
    this.debugOpen("publishDocument deferred", { reason, phase: this.phase });
  }

  onIframeLoad(): void {
    const iframe = this.options.getIframe();
    this.debugOpen("iframe onLoad", {
      iframeSrc: iframe?.src ?? null,
      phase: this.phase,
    });
    if (this.phase === "mounting") {
      this.scheduleMountTimeout();
    }
  }

  onIframeError(): void {
    warnMindMapBridge("iframe onError", {
      iframeSrc: this.options.getIframe()?.src ?? NATIVE_MINDMAP_URL,
    });
    this.fail({
      kind: "error",
      recoverable: false,
      userMessage:
        "mindmap iframe 加载失败：请检查 /mind-map/index.html 是否可访问",
    });
  }

  learnOrigin(origin: string): void {
    if (!this.learnedOrigin) {
      this.learnedOrigin = origin;
      this.emitSnapshot();
    }
  }

  handleNativeMessage(
    message: NativeMindMapMessage,
    eventOrigin: string,
  ): "consumed" | "ignored" {
    this.learnOrigin(eventOrigin);

    switch (message.type) {
      case "mindMapIframeError":
        this.handleIframeFailure(message.payload);
        return "consumed";
      case "ready":
        this.onIframeReady();
        return "consumed";
      case "appInited":
        this.onAppInited();
        return "consumed";
      default:
        return "ignored";
    }
  }

  isMessageFromCurrentIframe(source: MessageEventSource | null): boolean {
    const iframe = this.options.getIframe();
    return !!iframe?.contentWindow && source === iframe.contentWindow;
  }

  postToNative(type: string, payload?: unknown): boolean {
    const iframe = this.options.getIframe();
    const hostOrigin =
      typeof window !== "undefined" ? window.location.origin : "";
    const snapshot = this.getSnapshot();

    const targetOrigin = resolveNativePostMessageTargetOrigin(iframe, {
      hostOrigin,
      bridgeReady: snapshot.isBridgeReady,
      iframeLoaded: isMindMapIframeDocumentComplete(iframe),
      learnedOrigin: this.learnedOrigin,
    });

    // 诊断转发消息不能再走 bridge debug，否则会与 forwardMindMapHostDebug 递归。
    if (type === "mindMapHostDebug") {
      if (!iframe?.contentWindow || !targetOrigin) {
        return false;
      }
      iframe.contentWindow.postMessage(
        { source: MINDMAP_HOST_SOURCE, type, payload },
        targetOrigin,
      );
      return true;
    }

    if (type === "initMindMap") {
      this.debugOpen(`postToNative ${type}`, {
        hasPayload: payload != null,
        targetOrigin,
        phase: this.phase,
      });
    } else if (type === "setMindMapData" && payload && typeof payload === "object") {
      const bridgePayload = payload as NativeMindMapBridgePayload;
      debugMindMapBridge(`postToNative ${type}`, {
        targetOrigin,
        phase: this.phase,
        rootChildren: bridgePayload.mindMapData?.root?.children?.length ?? 0,
        sampleNode: findFirstRichMindMapNodeSummary(bridgePayload.mindMapData),
      });
    } else {
      debugMindMapBridge(`postToNative ${type}`, { targetOrigin, phase: this.phase });
    }

    if (!iframe?.contentWindow || !targetOrigin) {
      if (type === "initMindMap") {
        warnMindMapBridge(`postToNative skipped ${type}`, {
          hasContentWindow: !!iframe?.contentWindow,
          targetOrigin,
          ...describeMindMapBridgeState({
            hostOrigin,
            iframeSrc: iframe?.src ?? null,
            bridgeReady: snapshot.isBridgeReady,
            appInited: snapshot.isAppReady,
            learnedOrigin: this.learnedOrigin,
            hasContentWindow: !!iframe?.contentWindow,
          }),
        });
      }
      return false;
    }

    iframe.contentWindow.postMessage(
      { source: MINDMAP_HOST_SOURCE, type, payload },
      targetOrigin,
    );
    return true;
  }

  private transition(next: MindMapHostBridgePhase): void {
    this.phase = next;
    this.emitSnapshot();
    if (next === "mounting") {
      this.options.callbacks.onStatus?.("等待 mindmap 原生界面加载…");
    }
  }

  private onIframeReady(): void {
    if (this.phase === "failed" || this.phase === "app_ready") {
      return;
    }
    this.clearMountTimeout();
    this.phase = "bridge_ready";
    this.markBridgeReadyDataset();
    this.debugOpen("bridge ready", { phase: this.phase });
    this.emitSnapshot();
    this.sendInitMindMap("iframe-ready");
    this.scheduleInitTimeout();
  }

  private sendInitMindMap(reason: string): void {
    if (!this.pendingPayload) {
      this.debugOpen("sendInitMindMap skipped: no payload", { reason });
      return;
    }
    if (this.phase !== "bridge_ready") {
      this.debugOpen("sendInitMindMap skipped: phase", {
        reason,
        phase: this.phase,
      });
      return;
    }

    this.debugOpen("sendInitMindMap", {
      reason,
      rootChildren: this.pendingPayload.mindMapData.root?.children?.length ?? 0,
      bootKey: this.bootKey,
      sampleNode: findFirstRichMindMapNodeSummary(
        this.pendingPayload.mindMapData,
      ),
    });

    const sent = this.postToNative("initMindMap", this.pendingPayload);
    if (sent) {
      this.phase = "init_sent";
      this.emitSnapshot();
      this.scheduleInitTimeout();
    }
  }

  private onAppInited(): void {
    this.clearInitTimeout();
    this.phase = "app_ready";
    this.lastFailure = null;
    this.options.callbacks.onError?.(null);
    this.options.callbacks.onNativeReady?.(true);
    this.options.callbacks.onStatus?.("已打开 mindmap 原生界面");
    this.emitSnapshot();
    this.debugOpen("received appInited", { phase: this.phase });
    if (this.pendingPayload) {
      this.debugOpen("flush pendingPayload after appInited", {
        rootChildren: this.pendingPayload.mindMapData.root?.children?.length ?? 0,
        sampleNode: findFirstRichMindMapNodeSummary(
          this.pendingPayload.mindMapData,
        ),
      });
      this.postToNative("setMindMapData", this.pendingPayload);
    }
  }

  private handleIframeFailure(payload?: MindMapIframeFailurePayload): void {
    this.clearInitTimeout();
    const failure = classifyMindMapIframeFailure(
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : null,
    );
    this.lastFailure = failure;
    warnMindMapBridge("iframe runtime error", { failure, payload });

    if (
      failure.recoverable &&
      this.chunkReloadAttempts < MINDMAP_MAX_CHUNK_RELOAD_ATTEMPTS &&
      this.pendingPayload
    ) {
      this.chunkReloadAttempts += 1;
      this.reloadIframe("chunk-load");
      this.options.callbacks.onStatus?.("代码块加载失败，正在重新加载…");
      return;
    }

    this.fail(failure);
  }

  private fail(failure: MindMapIframeFailureClassification): void {
    this.clearTimers();
    this.phase = "failed";
    this.lastFailure = failure;
    this.options.callbacks.onError?.(failure.userMessage);
    this.options.callbacks.onStatus?.("加载失败");
    this.options.callbacks.onNativeReady?.(false);
    this.emitSnapshot();
  }

  private reloadIframe(reason: string): void {
    this.debugOpen("reloadMindMapIframe", {
      reason,
      attempt: this.chunkReloadAttempts,
      bootKey: this.bootKey,
    });
    this.clearTimers();
    this.bootKey += 1;
    this.phase = "idle";
    this.learnedOrigin = null;
    this.deleteBridgeReadyDataset();
    this.options.callbacks.onBootKeyChange?.(this.bootKey);
    this.options.callbacks.onError?.(null);
    this.options.callbacks.onNativeReady?.(false);
    this.transition("mounting");
  }

  private scheduleMountTimeout(): void {
    this.clearMountTimeout();
    this.mountTimeoutId = window.setTimeout(() => {
      this.mountTimeoutId = null;
      if (this.phase !== "mounting") {
        return;
      }
      warnMindMapBridge("iframe bridge mount timeout", {
        timeoutMs: MINDMAP_BRIDGE_MOUNT_TIMEOUT_MS,
        ...describeMindMapBridgeState({
          hostOrigin: window.location.origin,
          iframeSrc: this.options.getIframe()?.src ?? NATIVE_MINDMAP_URL,
          bridgeReady: false,
          appInited: false,
          learnedOrigin: this.learnedOrigin,
          hasContentWindow: !!this.options.getIframe()?.contentWindow,
        }),
      });
      this.fail({
        kind: "runtime-timeout",
        recoverable: false,
        userMessage:
          "mindmap 原生 iframe 未就绪：请确认 /mind-map/index.html 与 dist/js 已完整部署（yarn build:production）",
      });
    }, MINDMAP_BRIDGE_MOUNT_TIMEOUT_MS);
  }

  private scheduleInitTimeout(): void {
    this.clearInitTimeout();
    this.initTimeoutId = window.setTimeout(() => {
      this.initTimeoutId = null;
      if (this.phase === "app_ready") {
        return;
      }
      warnMindMapBridge("native app init timeout", {
        timeoutMs: MINDMAP_APP_INIT_TIMEOUT_MS,
        phase: this.phase,
      });
      const hasPayload = this.pendingPayload != null;
      const userMessage = hasPayload
        ? "mindmap 原生界面未完成初始化：已发送数据但未收到 appInited。请确认 /mind-map/dist/js/ 可访问。"
        : "mindmap 原生界面未完成初始化：文档数据尚未就绪。";
      this.fail({
        kind: "runtime-timeout",
        recoverable: false,
        userMessage,
      });
    }, MINDMAP_APP_INIT_TIMEOUT_MS);
  }

  private clearMountTimeout(): void {
    if (this.mountTimeoutId) {
      window.clearTimeout(this.mountTimeoutId);
      this.mountTimeoutId = null;
    }
  }

  private clearInitTimeout(): void {
    if (this.initTimeoutId) {
      window.clearTimeout(this.initTimeoutId);
      this.initTimeoutId = null;
    }
  }

  private clearTimers(): void {
    this.clearMountTimeout();
    this.clearInitTimeout();
  }

  private markBridgeReadyDataset(): void {
    const iframe = this.options.getIframe();
    if (iframe) {
      iframe.dataset.mindMapBridgeReady = "1";
    }
  }

  private deleteBridgeReadyDataset(): void {
    const iframe = this.options.getIframe();
    if (iframe) {
      delete iframe.dataset.mindMapBridgeReady;
    }
  }

  private emitSnapshot(): void {
    this.options.callbacks.onSnapshot(this.getSnapshot());
  }

  private debugOpen(label: string, data?: Record<string, unknown>): void {
    this.options.debugOpen?.(label, {
      sinceSessionStart:
        this.sessionStartMs > 0
          ? Math.round(performance.now() - this.sessionStartMs)
          : undefined,
      ...data,
    });
  }
}
