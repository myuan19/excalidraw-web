import { zoomToFitBounds } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { computeExcalidrawThumbnailSceneBounds } from "./thumbnailViewport";

/**
 * 无浏览器视口快照时：按列表缩略图同一视野（padding + 最小 480×288）居中显示。
 * 使用 fitToViewport=false + maxZoom=1，避免极小图形被放大到占满全屏（fitToViewport 会 zoom>100%）。
 */
export function scrollEditorToFitContent(api: ExcalidrawImperativeAPI): void {
  const elements = api.getSceneElements();
  const bounds = computeExcalidrawThumbnailSceneBounds(elements);
  if (!bounds) {
    return;
  }

  const appState = api.getAppState();
  const { appState: nextAppState } = zoomToFitBounds({
    bounds,
    appState,
    fitToViewport: false,
    viewportZoomFactor: 1,
    maxZoom: 1,
  });

  api.updateScene({
    appState: {
      scrollX: nextAppState.scrollX,
      scrollY: nextAppState.scrollY,
      zoom: nextAppState.zoom,
    },
  });
}

/**
 * 在下一帧回调揭示画布。
 * 当 skipFit=true（浏览器快照已恢复视口）时不做 fitToViewport，直接揭示。
 */
export function revealForkCanvasAfterFit(
  api: ExcalidrawImperativeAPI,
  onDone: () => void,
  opts?: { skipFit?: boolean },
): void {
  requestAnimationFrame(() => {
    if (!opts?.skipFit) {
      scrollEditorToFitContent(api);
    }
    requestAnimationFrame(() => {
      onDone();
    });
  });
}
