import { devDebug } from "../lib/devDebug";

export type DefaultViewport = {
  scrollX: number;
  scrollY: number;
  zoom: number;
};

export function embedMark(name: string): void {
  try {
    performance.mark(`embed:${name}`);
  } catch {
    // Performance marks are best-effort instrumentation.
  }
}

export function embedMeasure(name: string, start: string, end: string): void {
  try {
    performance.measure(`embed:${name}`, `embed:${start}`, `embed:${end}`);
  } catch {
    // Performance measures are best-effort instrumentation.
  }
}

export function embedDebug(event: string, data?: Record<string, unknown>): void {
  devDebug("embed", event, data);
}

export function roundViewport(
  viewport: DefaultViewport | null,
): DefaultViewport | null {
  if (!viewport) {
    return null;
  }
  return {
    scrollX: Math.round(viewport.scrollX * 100) / 100,
    scrollY: Math.round(viewport.scrollY * 100) / 100,
    zoom: Math.round(viewport.zoom * 10000) / 10000,
  };
}
