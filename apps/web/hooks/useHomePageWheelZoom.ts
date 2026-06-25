import { useEffect, useRef, type RefObject } from "react";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const STEP = 0.05;
const STORAGE_KEY = "editorhub-home-ui-zoom-v1";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readStoredZoom(): number {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? Number.parseFloat(raw) : 1;
    return Number.isFinite(parsed) ? clamp(parsed, MIN_ZOOM, MAX_ZOOM) : 1;
  } catch {
    return 1;
  }
}

/** 首页文件列表：Ctrl + 滚轮缩放整页 UI（类似浏览器缩放）。 */
export function useHomePageWheelZoom(
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  const zoomRef = useRef(readStoredZoom());

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const applyZoom = (nextZoom: number) => {
      const zoom = clamp(Math.round(nextZoom * 100) / 100, MIN_ZOOM, MAX_ZOOM);
      zoomRef.current = zoom;
      container.style.zoom = String(zoom);
      try {
        sessionStorage.setItem(STORAGE_KEY, String(zoom));
      } catch {
        // ignore quota
      }
    };

    applyZoom(zoomRef.current);

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) {
        return;
      }
      event.preventDefault();
      const delta = event.deltaY < 0 ? STEP : -STEP;
      applyZoom(zoomRef.current + delta);
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", onWheel);
      container.style.zoom = "";
    };
  }, [containerRef, enabled]);
}
