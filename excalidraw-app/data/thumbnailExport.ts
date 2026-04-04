import type { AppState } from "@excalidraw/excalidraw/types";

/**
 * 文件列表缩略图导出：在元素外接矩形外增加留白（画布背景会一起导出），
 * 缩略图仍铺满卡片（slice），但相对「零留白」时可视上略缩小主体、少裁切边缘。
 * 约相当于在常见尺寸下把内容占画面比例调到接近 2/3 档的观感。
 */
export const FILE_LIST_THUMB_EXPORT_PADDING = 48;

/** 列表缩略图需导出背景，留白区域与画布一致，避免边缘发灰/透明 */
export function appStateForThumbnailExport(appState: AppState): AppState {
  return {
    ...appState,
    exportBackground: true,
  };
}
