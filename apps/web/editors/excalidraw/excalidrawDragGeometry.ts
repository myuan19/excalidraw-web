/**
 * 拖动几何探针：定位“画布只跟随指针 ~1/10”的桌面端缩放错配。
 *
 * Excalidraw 的指针↔场景换算本身是自洽的（render 的 ×zoom 抵消 pointer 的
 * ÷zoom，dpr 经 CSS 尺寸抵消）。一旦出现持续的欠跟随，必然是运行时
 * devicePixelRatio / 画布 backing 尺寸 / CSS 尺寸 / appState.width 之间不一致。
 * 该探针在每次拖动开始时采一帧关键几何量，写入 issue.diag（grep
 * `excalidraw.drag | geometry`），用于精确判断错配来源，而非盲目打补丁。
 */

import { traceIssueDiag } from "../../lib/issueDiagTrace";

export type ExcalidrawDragGeometrySample = {
  dpr: number | null;
  zoom: number | null;
  stateWidth: number | null;
  stateHeight: number | null;
  offsetLeft: number | null;
  offsetTop: number | null;
  canvasBackingW: number | null;
  canvasClientW: number | null;
  rectW: number | null;
  innerW: number | null;
  /** backing / (cssWidth * dpr)：健康值≈1，偏离说明 dpr 与 backing 不一致。 */
  backingPerCssDpr: number | null;
  /** rect / cssWidth：健康值≈1，偏离说明祖先存在缩放变换。 */
  rectPerClient: number | null;
  /** cssWidth / appState.width：健康值≈1，偏离说明 App 量到的尺寸与实际不符。 */
  clientPerStateWidth: number | null;
};

type AppStateLike = {
  zoom?: { value?: number };
  width?: number;
  height?: number;
  offsetLeft?: number;
  offsetTop?: number;
};

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** 纯函数：根据原始几何量推导比值，便于单测与日志直读。 */
export function deriveExcalidrawDragGeometry(input: {
  dpr: number;
  appState: AppStateLike | null;
  canvasBackingW: number | null;
  canvasClientW: number | null;
  rectW: number | null;
  innerW: number | null;
}): ExcalidrawDragGeometrySample {
  const zoom = input.appState?.zoom?.value ?? null;
  const stateWidth = input.appState?.width ?? null;
  const cssW = input.canvasClientW ?? null;
  const backingW = input.canvasBackingW ?? null;

  return {
    dpr: input.dpr,
    zoom,
    stateWidth,
    stateHeight: input.appState?.height ?? null,
    offsetLeft: input.appState?.offsetLeft ?? null,
    offsetTop: input.appState?.offsetTop ?? null,
    canvasBackingW: backingW,
    canvasClientW: cssW,
    rectW: input.rectW,
    innerW: input.innerW,
    backingPerCssDpr:
      backingW != null && cssW != null && cssW > 0 && input.dpr > 0
        ? round3(backingW / (cssW * input.dpr))
        : null,
    rectPerClient:
      input.rectW != null && cssW != null && cssW > 0
        ? round3(input.rectW / cssW)
        : null,
    clientPerStateWidth:
      cssW != null && stateWidth != null && stateWidth > 0
        ? round3(cssW / stateWidth)
        : null,
  };
}

function resolveInteractiveCanvas(
  root: ParentNode | null,
): HTMLCanvasElement | null {
  const scope = root ?? (typeof document !== "undefined" ? document : null);
  if (!scope) {
    return null;
  }
  return (
    scope.querySelector<HTMLCanvasElement>("canvas.excalidraw__canvas.interactive") ??
    scope.querySelector<HTMLCanvasElement>("canvas.excalidraw__canvas")
  );
}

/** 采集一帧拖动几何量（仅在传入的 root 范围内查找画布）。 */
export function sampleExcalidrawDragGeometry(
  excalidrawAPI: { getAppState?: () => AppStateLike } | null,
  root: ParentNode | null,
): ExcalidrawDragGeometrySample | null {
  if (typeof window === "undefined") {
    return null;
  }
  const canvas = resolveInteractiveCanvas(root);
  const rect = canvas?.getBoundingClientRect();
  return deriveExcalidrawDragGeometry({
    dpr: window.devicePixelRatio,
    appState: excalidrawAPI?.getAppState?.() ?? null,
    canvasBackingW: canvas?.width ?? null,
    canvasClientW: canvas?.clientWidth ?? null,
    rectW: rect ? Math.round(rect.width) : null,
    innerW: window.innerWidth,
  });
}

/** 拖动开始时采一帧几何量并写入 issue.diag（grep `excalidraw.drag | geometry`）。 */
export function traceExcalidrawDragGeometry(
  excalidrawAPI: { getAppState?: () => AppStateLike } | null,
  root: ParentNode | null,
  extra?: Record<string, unknown>,
): void {
  const sample = sampleExcalidrawDragGeometry(excalidrawAPI, root);
  if (!sample) {
    return;
  }
  traceIssueDiag(
    "excalidraw.drag",
    "geometry",
    { ...(extra ?? {}), ...sample },
    "branch",
  );
}
