import { describe, expect, it } from "vitest";

import { deriveExcalidrawDragGeometry } from "./excalidrawDragGeometry";

describe("deriveExcalidrawDragGeometry", () => {
  it("reports healthy ratios (~1) for a consistent layout", () => {
    const sample = deriveExcalidrawDragGeometry({
      dpr: 2,
      appState: { zoom: { value: 1 }, width: 800, height: 600 },
      canvasBackingW: 1600,
      canvasClientW: 800,
      rectW: 800,
      innerW: 1280,
    });

    expect(sample.backingPerCssDpr).toBe(1);
    expect(sample.rectPerClient).toBe(1);
    expect(sample.clientPerStateWidth).toBe(1);
    expect(sample.zoom).toBe(1);
  });

  it("flags an ancestor scale transform via rectPerClient", () => {
    const sample = deriveExcalidrawDragGeometry({
      dpr: 1,
      appState: { zoom: { value: 1 }, width: 800 },
      canvasBackingW: 800,
      canvasClientW: 800,
      rectW: 80, // 渲染被缩放到 1/10
      innerW: 1280,
    });

    expect(sample.rectPerClient).toBe(0.1);
  });

  it("flags backing/dpr mismatch when canvas backing under-scales", () => {
    const sample = deriveExcalidrawDragGeometry({
      dpr: 3,
      appState: { zoom: { value: 1 }, width: 800 },
      canvasBackingW: 800, // backing 未乘 dpr
      canvasClientW: 800,
      rectW: 800,
      innerW: 1280,
    });

    expect(sample.backingPerCssDpr).toBeCloseTo(0.333, 2);
  });

  it("returns null ratios when inputs are missing", () => {
    const sample = deriveExcalidrawDragGeometry({
      dpr: 1,
      appState: null,
      canvasBackingW: null,
      canvasClientW: null,
      rectW: null,
      innerW: null,
    });

    expect(sample.backingPerCssDpr).toBeNull();
    expect(sample.rectPerClient).toBeNull();
    expect(sample.clientPerStateWidth).toBeNull();
    expect(sample.zoom).toBeNull();
  });
});
