import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

/**
 * Git HEAD（6ceb8fa0）生产路径：parse → convertToExcalidrawElements，无连线后处理。
 * 对应 packages/excalidraw/components/TTDDialog/common.ts 在提交时的行为。
 */
export const GIT_HEAD_COMMIT = "6ceb8fa0";

export const applyGitHeadConnectorPipeline = (
  elements: readonly NonDeletedExcalidrawElement[],
): readonly NonDeletedExcalidrawElement[] => elements;
