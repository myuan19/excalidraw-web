import previewViewportConfig from "./native/previewViewportConfig.json";

const DEFAULTS = {
  targetAspect: previewViewportConfig.targetAspect,
  baselineNodeCount: previewViewportConfig.baselineNodeCount,
  minVisualScaleNodeCount: previewViewportConfig.minVisualScaleNodeCount,
  singleNodeVisualScale: previewViewportConfig.singleNodeVisualScale,
  singleRootOnlyVisualScaleFactor:
    previewViewportConfig.singleRootOnlyVisualScaleFactor ?? 1,
  editorEmbedSingleRootOnlyVisualScaleFactor:
    previewViewportConfig.editorEmbedSingleRootOnlyVisualScaleFactor ?? 1,
  thumbnailSingleRootOnlyVisualScaleFactor:
    previewViewportConfig.thumbnailSingleRootOnlyVisualScaleFactor ??
    previewViewportConfig.singleRootOnlyVisualScaleFactor ??
    1,
  minNodeVisualScale: previewViewportConfig.minNodeVisualScale,
  nodeCountScaleInfluence:
    previewViewportConfig.nodeCountScaleInfluence ?? 1,
  editorEmbedNodeCountScaleInfluence:
    previewViewportConfig.editorEmbedNodeCountScaleInfluence ?? 1,
  centerTowardOthersRatio: previewViewportConfig.centerTowardOthersRatio,
  rootCenterLimitRatio: previewViewportConfig.rootCenterLimitRatio,
  thumbnailCenterTowardOthersRatio:
    previewViewportConfig.thumbnailCenterTowardOthersRatio ??
    previewViewportConfig.centerTowardOthersRatio,
  thumbnailRootCenterLimitRatio:
    previewViewportConfig.thumbnailRootCenterLimitRatio ??
    previewViewportConfig.rootCenterLimitRatio,
  editorEmbedCenterTowardOthersRatio:
    previewViewportConfig.editorEmbedCenterTowardOthersRatio ??
    previewViewportConfig.centerTowardOthersRatio,
  editorEmbedRootCenterLimitRatio:
    previewViewportConfig.editorEmbedRootCenterLimitRatio ??
    previewViewportConfig.rootCenterLimitRatio,
  rootAnchorXRatio: previewViewportConfig.rootAnchorXRatio ?? 0.25,
  rootWidthBaseline: previewViewportConfig.rootWidthBaseline ?? 120,
  rootWidthDamping: previewViewportConfig.rootWidthDamping ?? 0.15,
};

function clamp(value, min, max) {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function effectiveRootWidth(width, options) {
  const baseline = options.rootWidthBaseline ?? DEFAULTS.rootWidthBaseline;
  const damping = clamp(
    options.rootWidthDamping ?? DEFAULTS.rootWidthDamping,
    0,
    1,
  );
  if (width <= baseline) {
    return width;
  }
  return baseline + (width - baseline) * damping;
}

export function centerOfMindMapBounds(bounds) {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}

export function unionMindMapBounds(items) {
  if (items.length <= 0) {
    return null;
  }
  const minX = Math.min(...items.map((item) => item.x));
  const minY = Math.min(...items.map((item) => item.y));
  const maxX = Math.max(...items.map((item) => item.x + item.width));
  const maxY = Math.max(...items.map((item) => item.y + item.height));
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function computeMindMapNodeVisualScale(nodeCount, options = {}) {
  const baselineNodeCount =
    options.baselineNodeCount ?? DEFAULTS.baselineNodeCount;
  const minVisualScaleNodeCount =
    options.minVisualScaleNodeCount ?? DEFAULTS.minVisualScaleNodeCount;
  const singleNodeVisualScale =
    options.singleNodeVisualScale ?? DEFAULTS.singleNodeVisualScale;
  const minNodeVisualScale =
    options.minNodeVisualScale ?? DEFAULTS.minNodeVisualScale;
  const influence = clamp(
    options.nodeCountScaleInfluence ?? DEFAULTS.nodeCountScaleInfluence,
    0,
    1,
  );

  let rawScale = 1;
  if (nodeCount <= baselineNodeCount) {
    const t = (baselineNodeCount - nodeCount) / (baselineNodeCount - 1);
    rawScale = 1 + clamp(t, 0, 1) * (singleNodeVisualScale - 1);
  } else {
    const t =
      (nodeCount - baselineNodeCount) /
      (minVisualScaleNodeCount - baselineNodeCount);
    rawScale = 1 - clamp(t, 0, 1) * (1 - minNodeVisualScale);
  }
  let scale = 1 + (rawScale - 1) * influence;
  if (nodeCount === 1) {
    const rootOnlyFactor =
      options.singleRootOnlyVisualScaleFactor ??
      DEFAULTS.singleRootOnlyVisualScaleFactor;
    scale *= rootOnlyFactor;
  }
  return scale;
}

export function computeMindMapFocusedViewBoxFromNodeBounds(
  nodeBounds,
  options,
) {
  const rootBounds = nodeBounds[0];
  if (!rootBounds) {
    return null;
  }

  const targetAspect = options.targetAspect ?? DEFAULTS.targetAspect;
  const centerTowardOthersRatio =
    options.centerTowardOthersRatio ?? DEFAULTS.centerTowardOthersRatio;
  const normalizedCenterTowardOthersRatio = clamp(
    centerTowardOthersRatio,
    0,
    1,
  );
  const rootCenterLimitRatio =
    options.rootCenterLimitRatio ?? DEFAULTS.rootCenterLimitRatio;

  const otherBounds = unionMindMapBounds(nodeBounds.slice(1));
  const rootAnchorXRatio = clamp(
    options.rootAnchorXRatio ?? DEFAULTS.rootAnchorXRatio,
    0,
    1,
  );
  const rootAnchor = {
    x: rootBounds.x + rootBounds.width * rootAnchorXRatio,
    y: rootBounds.y + rootBounds.height / 2,
  };
  const otherCenter = otherBounds
    ? centerOfMindMapBounds(otherBounds)
    : rootAnchor;
  const nodeVisualScale = computeMindMapNodeVisualScale(
    nodeBounds.length,
    options,
  );
  const targetRootRatio = options.targetRootScreenRatio * nodeVisualScale;
  const effectiveW = effectiveRootWidth(rootBounds.width, options);
  const baseWidth = Math.max(
    effectiveW / targetRootRatio,
    (rootBounds.height / targetRootRatio) * targetAspect,
  );
  const viewSize = {
    width: baseWidth,
    height: baseWidth / targetAspect,
  };
  const rawCenter = {
    x:
      rootAnchor.x +
      (otherCenter.x - rootAnchor.x) * normalizedCenterTowardOthersRatio,
    y:
      rootAnchor.y +
      (otherCenter.y - rootAnchor.y) * normalizedCenterTowardOthersRatio,
  };
  const normalizedRootCenterLimitRatio = clamp(rootCenterLimitRatio, 0, 1);
  const rootVisibleCenterLimit = {
    x: Math.max(0, 0.5 - rootBounds.width / viewSize.width / 2),
    y: Math.max(0, 0.5 - rootBounds.height / viewSize.height / 2),
  };
  const rootCenterLimit = {
    x: rootVisibleCenterLimit.x * normalizedRootCenterLimitRatio,
    y: rootVisibleCenterLimit.y * normalizedRootCenterLimitRatio,
  };
  const limitedCenter = {
    x: clamp(
      rawCenter.x,
      rootAnchor.x - viewSize.width * rootCenterLimit.x,
      rootAnchor.x + viewSize.width * rootCenterLimit.x,
    ),
    y: clamp(
      rawCenter.y,
      rootAnchor.y - viewSize.height * rootCenterLimit.y,
      rootAnchor.y + viewSize.height * rootCenterLimit.y,
    ),
  };

  return {
    x: limitedCenter.x - viewSize.width / 2,
    y: limitedCenter.y - viewSize.height / 2,
    width: viewSize.width,
    height: viewSize.height,
    nodeCount: nodeBounds.length,
    rootBounds,
    otherBounds,
    rootScreen: {
      centerX:
        ((rootAnchor.x - (limitedCenter.x - viewSize.width / 2)) /
          viewSize.width) *
        100,
      centerY:
        ((rootAnchor.y - (limitedCenter.y - viewSize.height / 2)) /
          viewSize.height) *
        100,
      width: (rootBounds.width / viewSize.width) * 100,
      height: (rootBounds.height / viewSize.height) * 100,
    },
  };
}

export function formatMindMapViewBox(viewBox) {
  return `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;
}

export function getMindMapThumbnailTargetRootScreenRatio() {
  return (
    previewViewportConfig.baselineRootScreenRatio *
    previewViewportConfig.thumbnailRootScreenRatioMultiplier
  );
}

export function getMindMapEditorFocusedTargetRootScreenRatio() {
  return (
    previewViewportConfig.baselineRootScreenRatio *
    previewViewportConfig.editorRootScreenRatioMultiplier
  );
}

export function getMindMapEmbedFocusedTargetRootScreenRatio() {
  const multiplier =
    previewViewportConfig.embedFocusedRootScreenRatioMultiplier ?? 0.75;
  return previewViewportConfig.baselineRootScreenRatio * multiplier;
}

function resolveConfiguredRootScreenRatio(configuredMultiplier, fallbackRatio) {
  const multiplier = Number(configuredMultiplier);
  if (Number.isFinite(multiplier) && multiplier > 0) {
    return previewViewportConfig.baselineRootScreenRatio * multiplier;
  }
  return fallbackRatio;
}

/** 画布（编辑器 / 嵌入）共用 focused 参数，仅 multiplier 与单根系数不同 */
export function buildMindMapCanvasFocusedViewBoxOptions(
  configuredMultiplier,
  kind,
) {
  const fallbackRatio =
    kind === "embed"
      ? getMindMapEmbedFocusedTargetRootScreenRatio()
      : getMindMapEditorFocusedTargetRootScreenRatio();
  return {
    targetAspect: DEFAULTS.targetAspect,
    targetRootScreenRatio: resolveConfiguredRootScreenRatio(
      configuredMultiplier,
      fallbackRatio,
    ),
    centerTowardOthersRatio: DEFAULTS.editorEmbedCenterTowardOthersRatio,
    rootCenterLimitRatio: DEFAULTS.editorEmbedRootCenterLimitRatio,
    baselineNodeCount: DEFAULTS.baselineNodeCount,
    minVisualScaleNodeCount: DEFAULTS.minVisualScaleNodeCount,
    singleNodeVisualScale: DEFAULTS.singleNodeVisualScale,
    minNodeVisualScale: DEFAULTS.minNodeVisualScale,
    nodeCountScaleInfluence: DEFAULTS.editorEmbedNodeCountScaleInfluence,
    singleRootOnlyVisualScaleFactor:
      DEFAULTS.editorEmbedSingleRootOnlyVisualScaleFactor,
  };
}

/** 缩略图 SVG 裁剪：同一套 viewBox 公式，独立 multiplier / 单根系数 */
export function buildMindMapThumbnailFocusedViewBoxOptions() {
  return {
    targetAspect: DEFAULTS.targetAspect,
    targetRootScreenRatio: getMindMapThumbnailTargetRootScreenRatio(),
    centerTowardOthersRatio: DEFAULTS.thumbnailCenterTowardOthersRatio,
    rootCenterLimitRatio: DEFAULTS.thumbnailRootCenterLimitRatio,
    baselineNodeCount: DEFAULTS.baselineNodeCount,
    minVisualScaleNodeCount: DEFAULTS.minVisualScaleNodeCount,
    singleNodeVisualScale: DEFAULTS.singleNodeVisualScale,
    minNodeVisualScale: DEFAULTS.minNodeVisualScale,
    nodeCountScaleInfluence: DEFAULTS.nodeCountScaleInfluence,
    singleRootOnlyVisualScaleFactor:
      DEFAULTS.thumbnailSingleRootOnlyVisualScaleFactor,
  };
}

/**
 * 文档仅有一个根节点时，渲染树里可能仍有展开按钮等子节点；
 * 画布 framing 只按根节点尺寸计算，避免根显示过小。
 */
export function filterMindMapFocusedNodeBounds(
  nodeBounds,
  singleRootOnlyDocument,
) {
  if (!singleRootOnlyDocument || nodeBounds.length <= 1) {
    return nodeBounds;
  }
  return [nodeBounds[0]];
}
