import previewViewportConfig from "./native/previewViewportConfig.json";

const DEFAULTS = {
  targetAspect: previewViewportConfig.targetAspect,
  baselineNodeCount: previewViewportConfig.baselineNodeCount,
  minVisualScaleNodeCount: previewViewportConfig.minVisualScaleNodeCount,
  singleNodeVisualScale: previewViewportConfig.singleNodeVisualScale,
  minNodeVisualScale: previewViewportConfig.minNodeVisualScale,
  nodeCountScaleInfluence:
    previewViewportConfig.nodeCountScaleInfluence ?? 1,
  centerTowardOthersRatio: previewViewportConfig.centerTowardOthersRatio,
  rootCenterLimitRatio: previewViewportConfig.rootCenterLimitRatio,
};

function clamp(value, min, max) {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
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
  return 1 + (rawScale - 1) * influence;
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
  const rootCenterLimitRatio =
    options.rootCenterLimitRatio ?? DEFAULTS.rootCenterLimitRatio;

  const otherBounds = unionMindMapBounds(nodeBounds.slice(1));
  const rootCenter = centerOfMindMapBounds(rootBounds);
  const otherCenter = otherBounds
    ? centerOfMindMapBounds(otherBounds)
    : rootCenter;
  const nodeVisualScale = computeMindMapNodeVisualScale(
    nodeBounds.length,
    options,
  );
  const targetRootRatio = options.targetRootScreenRatio * nodeVisualScale;
  const baseWidth = Math.max(
    rootBounds.width / targetRootRatio,
    (rootBounds.height / targetRootRatio) * targetAspect,
  );
  const viewSize = {
    width: baseWidth,
    height: baseWidth / targetAspect,
  };
  const rawCenter = {
    x:
      rootCenter.x +
      (otherCenter.x - rootCenter.x) * centerTowardOthersRatio,
    y:
      rootCenter.y +
      (otherCenter.y - rootCenter.y) * centerTowardOthersRatio,
  };
  const limitedCenter = {
    x: clamp(
      rawCenter.x,
      rootCenter.x - viewSize.width * rootCenterLimitRatio,
      rootCenter.x + viewSize.width * rootCenterLimitRatio,
    ),
    y: clamp(
      rawCenter.y,
      rootCenter.y - viewSize.height * rootCenterLimitRatio,
      rootCenter.y + viewSize.height * rootCenterLimitRatio,
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
        ((rootCenter.x - (limitedCenter.x - viewSize.width / 2)) /
          viewSize.width) *
        100,
      centerY:
        ((rootCenter.y - (limitedCenter.y - viewSize.height / 2)) /
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

export function getMindMapEmbedFocusedTargetRootScreenRatio() {
  const multiplier =
    previewViewportConfig.embedFocusedRootScreenRatioMultiplier ?? 0.4;
  return previewViewportConfig.baselineRootScreenRatio * multiplier;
}
