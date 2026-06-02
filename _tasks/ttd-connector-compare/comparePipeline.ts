import { convertToExcalidrawElements } from "@excalidraw/element";

import {
  smoothConnectorCorners,
  stripConnectorRoundness,
  type TTDConnectorStats,
} from "../../packages/excalidraw/components/TTDDialog/connectorPostProcess";

import { applyGitHeadConnectorPipeline, GIT_HEAD_COMMIT } from "./gitHeadPipeline";

import type { BinaryFiles } from "../../packages/excalidraw/types";
import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

export type CompareVariants = {
  /** Git HEAD：无后处理 */
  gitHeadElements: readonly NonDeletedExcalidrawElement[];
  /** 去掉 Mermaid roundness，保留原始走线 */
  sharpElements: readonly NonDeletedExcalidrawElement[];
  /** 工作区当前 TTD 后处理 */
  currentElements: readonly NonDeletedExcalidrawElement[];
  files: BinaryFiles;
  connectorStats: TTDConnectorStats;
  mermaid: string;
  gitHeadCommit: string;
};

const stripRoundnessForSharpCompare = (
  elements: readonly NonDeletedExcalidrawElement[],
): readonly NonDeletedExcalidrawElement[] =>
  stripConnectorRoundness(elements).elements;

/** 对比图去掉连线标签（否/是/已加载等），避免遮挡拐角 */
const stripEdgeLabelsForCompare = (
  elements: readonly NonDeletedExcalidrawElement[],
): readonly NonDeletedExcalidrawElement[] => {
  const linearContainerIds = new Set(
    elements
      .filter((element) => element.type === "arrow" || element.type === "line")
      .map((element) => element.id),
  );

  return elements.filter((element) => {
    if (element.type !== "text") {
      return true;
    }
    const containerId =
      "containerId" in element ? element.containerId : undefined;
    // 节点内文字：containerId 指向矩形/菱形等；连线标签：containerId 指向 arrow
    if (!containerId) {
      return false;
    }
    return !linearContainerIds.has(containerId);
  });
};

/** 与 TTD common.ts 相同 parse/convert；后处理分三路对比。 */
export const buildCompareVariants = async (
  mermaid: string,
): Promise<CompareVariants> => {
  const trimmed = mermaid.trim();
  const { parseMermaidToExcalidraw } = await import(
    "@excalidraw/mermaid-to-excalidraw"
  );

  const parsed = await parseMermaidToExcalidraw(trimmed);
  const converted = stripEdgeLabelsForCompare(
    convertToExcalidrawElements(parsed.elements, {
      regenerateIds: true,
    }),
  );
  const files = (parsed.files ?? {}) as BinaryFiles;

  const gitHeadElements = applyGitHeadConnectorPipeline(converted);
  const sharpElements = stripRoundnessForSharpCompare(converted);
  const { elements: currentElements, connectorStats } =
    smoothConnectorCorners(converted);

  return {
    gitHeadElements,
    sharpElements,
    currentElements,
    files,
    connectorStats,
    mermaid: trimmed,
    gitHeadCommit: GIT_HEAD_COMMIT,
  };
};
