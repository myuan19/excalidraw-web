import { getCommonBounds } from "@excalidraw/element";
import { getNonDeletedElements } from "@excalidraw/element";
import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { Bounds } from "@excalidraw/common";

import {
  FILE_LIST_THUMB_EXPORT_PADDING,
  FILE_LIST_THUMB_MIN_VIEWPORT_HEIGHT,
  FILE_LIST_THUMB_MIN_VIEWPORT_WIDTH,
} from "./thumbnailExport";

export type SceneRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** 与列表缩略图 expandThumbnailSvgToMinimumViewport 同一套居中扩展规则。 */
export function expandRectToMinimumSize(
  rect: SceneRect,
  minWidth: number,
  minHeight: number,
): SceneRect {
  if (
    !Number.isFinite(minWidth) ||
    !Number.isFinite(minHeight) ||
    minWidth <= 0 ||
    minHeight <= 0 ||
    (rect.width >= minWidth && rect.height >= minHeight)
  ) {
    return rect;
  }

  const nextWidth = Math.max(rect.width, minWidth);
  const nextHeight = Math.max(rect.height, minHeight);
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  return {
    x: centerX - nextWidth / 2,
    y: centerY - nextHeight / 2,
    width: nextWidth,
    height: nextHeight,
  };
}

/**
 * Excalidraw 列表缩略图在场景坐标下的可见区域：
 * exportPadding 外扩 + 最小 480×288 视野（与 buildSceneThumbnailSvg 一致）。
 */
export function computeExcalidrawThumbnailSceneBounds(
  elements: readonly ExcalidrawElement[],
  opts?: {
    exportPadding?: number;
    minWidth?: number;
    minHeight?: number;
  },
): Bounds | null {
  const nonDeleted = getNonDeletedElements(elements);
  if (nonDeleted.length === 0) {
    return null;
  }

  const exportPadding = opts?.exportPadding ?? FILE_LIST_THUMB_EXPORT_PADDING;
  const minWidth = opts?.minWidth ?? FILE_LIST_THUMB_MIN_VIEWPORT_WIDTH;
  const minHeight = opts?.minHeight ?? FILE_LIST_THUMB_MIN_VIEWPORT_HEIGHT;

  const [minX, minY, maxX, maxY] = getCommonBounds(nonDeleted);
  const padded = expandRectToMinimumSize(
    {
      x: minX - exportPadding,
      y: minY - exportPadding,
      width: maxX - minX + exportPadding * 2,
      height: maxY - minY + exportPadding * 2,
    },
    minWidth,
    minHeight,
  );

  return [
    padded.x,
    padded.y,
    padded.x + padded.width,
    padded.y + padded.height,
  ] as Bounds;
}
