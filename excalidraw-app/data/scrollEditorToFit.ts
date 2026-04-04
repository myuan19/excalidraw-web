import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

/**
 * 打开或切换文件后：将内容居中显示，保持默认缩放（不强制适配视口大小）。
 */
export function scrollEditorToFitContent(api: ExcalidrawImperativeAPI): void {
  const elements = api.getSceneElements();
  if (elements.length === 0) {
    return;
  }
  api.scrollToContent(elements, {
    fitToViewport: false,
    animate: false,
  });
}
