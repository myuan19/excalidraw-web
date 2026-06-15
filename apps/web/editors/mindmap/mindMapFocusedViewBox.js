export function buildMindMapThumbnailFocusedViewBoxOptions() {
  return {
    padding: 48,
    minWidth: 420,
    minHeight: 252,
  };
}

export function computeMindMapFocusedViewBoxFromNodeBounds(bounds, options = {}) {
  if (!Array.isArray(bounds) || bounds.length === 0) {
    return null;
  }
  const padding = options.padding ?? 48;
  const minWidth = options.minWidth ?? 420;
  const minHeight = options.minHeight ?? 252;
  const rootBounds = bounds[0];
  const all = bounds.reduce(
    (acc, item) => ({
      x1: Math.min(acc.x1, item.x),
      y1: Math.min(acc.y1, item.y),
      x2: Math.max(acc.x2, item.x + item.width),
      y2: Math.max(acc.y2, item.y + item.height),
    }),
    {
      x1: rootBounds.x,
      y1: rootBounds.y,
      x2: rootBounds.x + rootBounds.width,
      y2: rootBounds.y + rootBounds.height,
    },
  );
  const width = Math.max(minWidth, all.x2 - all.x1 + padding * 2);
  const height = Math.max(minHeight, all.y2 - all.y1 + padding * 2);
  const x = all.x1 - padding - Math.max(0, width - (all.x2 - all.x1 + padding * 2)) / 2;
  const y = all.y1 - padding - Math.max(0, height - (all.y2 - all.y1 + padding * 2)) / 2;

  return {
    x,
    y,
    width,
    height,
    nodeCount: bounds.length,
    rootBounds,
    otherBounds: bounds.slice(1),
    rootScreen: {
      centerX: rootBounds.x + rootBounds.width / 2,
      centerY: rootBounds.y + rootBounds.height / 2,
      width: rootBounds.width,
      height: rootBounds.height,
    },
  };
}

export function formatMindMapViewBox(viewBox) {
  return [viewBox.x, viewBox.y, viewBox.width, viewBox.height]
    .map((value) => Number(value.toFixed(2)))
    .join(" ");
}
