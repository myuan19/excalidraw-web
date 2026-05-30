import { MindMapAdapter } from "../../data/formats/MindMapAdapter";
import previewViewportConfig from "./native/previewViewportConfig.json";

import type { MindMapDocumentData } from "../../data/formats/MindMapAdapter";

function getMindMapChildren(node: unknown): unknown[] {
  if (!node || typeof node !== "object") {
    return [];
  }
  const children = (node as { children?: unknown }).children;
  return Array.isArray(children) ? children : [];
}

function analyzeMindMapTree(root: unknown): {
  maxDepth: number;
  leafCount: number;
  rootChildren: number;
} {
  const rootChildren = getMindMapChildren(root);
  let maxDepth = 1;
  let leafCount = rootChildren.length === 0 ? 1 : 0;
  const walk = (node: unknown, depth: number) => {
    const children = getMindMapChildren(node);
    maxDepth = Math.max(maxDepth, depth);
    if (children.length === 0) {
      leafCount += 1;
      return;
    }
    children.forEach((child) => walk(child, depth + 1));
  };
  rootChildren.forEach((child) => walk(child, 2));
  return {
    maxDepth,
    leafCount,
    rootChildren: rootChildren.length,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function computeMindMapPreviewRootTargetX(data: MindMapDocumentData): number {
  const metrics = analyzeMindMapTree(data.root);
  if (metrics.rootChildren === 0) {
    return 0.5;
  }
  const depthScore = clamp((metrics.maxDepth - 1) / 4, 0, 1);
  const branchScore = clamp((metrics.rootChildren - 1) / 5, 0, 1);
  const leafScore = clamp((metrics.leafCount - 1) / 14, 0, 1);
  const complexity = clamp(
    depthScore * 0.6 + branchScore * 0.25 + leafScore * 0.15,
    0,
    1,
  );
  return clamp(0.5 - complexity * 0.3, 0.2, 0.5);
}

function buildMindMapPreviewData(data: MindMapDocumentData): MindMapDocumentData {
  const config = {
    ...(data.config ?? {}),
    __nbPreviewTargetX: computeMindMapPreviewRootTargetX(data),
    __nbPreviewTargetY: 0.5,
    __nbPreviewRootScreenRatioMultiplier:
      previewViewportConfig.embedRootScreenRatioMultiplier,
  };
  const { view: _view, ...withoutView } = data;
  return {
    ...withoutView,
    config,
  };
}

export function prepareMindMapEmbedData(raw: unknown): MindMapDocumentData {
  return MindMapAdapter.migrate(raw, 1);
}

export function buildMindMapEmbedBridgePayload(data: MindMapDocumentData) {
  const mindMapData = buildMindMapPreviewData(data);
  return {
    mindMapData,
    mindMapConfig: mindMapData.config ?? {},
    lang: mindMapData.lang ?? "zh",
    localConfig: mindMapData.localConfig ?? null,
    embedMode: true,
    readOnly: true,
  };
}
