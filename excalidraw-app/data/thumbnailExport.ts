import type { AppState } from "@excalidraw/excalidraw/types";

/**
 * 文件列表缩略图导出：在元素外接矩形外保留少量内边，避免笔划被裁切。
 * 列表卡片上由 `patchThumbnailSvgForCard`（meet）在 5/3 区域内整幅显示。
 */
export const FILE_LIST_THUMB_EXPORT_PADDING = 8;

/** 与列表卡片预览区 `aspect-ratio` 一致（宽 ÷ 高）；供需要统一比例的调用方复用。 */
export const FILE_LIST_THUMB_DISPLAY_ASPECT = 5 / 3;

/** 列表缩略图需导出背景，留白区域与画布一致，避免边缘发灰/透明 */
export function appStateForThumbnailExport(appState: AppState): AppState {
  return {
    ...appState,
    exportBackground: true,
  };
}
