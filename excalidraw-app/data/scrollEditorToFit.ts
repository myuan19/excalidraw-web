import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

/**
 * 打开或切换文件后：将内容适配进视口，尽量完整展示（含大画布）。
 */
export function scrollEditorToFitContent(api: ExcalidrawImperativeAPI): void {
  const elements = api.getSceneElements();
  if (elements.length === 0) {
    return;
  }
  api.scrollToContent(elements, {
    fitToViewport: true,
    animate: false,
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
