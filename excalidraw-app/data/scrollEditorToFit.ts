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
 * 在下一帧执行 fit，再下一帧回调，避免用户看到「先按保存的缩放/滚动一帧，再跳到适配视口」的闪烁。
 */
export function revealForkCanvasAfterFit(
  api: ExcalidrawImperativeAPI,
  onDone: () => void,
): void {
  requestAnimationFrame(() => {
    scrollEditorToFitContent(api);
    requestAnimationFrame(() => {
      onDone();
    });
  });
}
