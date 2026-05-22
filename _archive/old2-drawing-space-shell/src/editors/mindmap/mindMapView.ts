/**
 * MindMap View 必须是 getTransformData() 形态：{ transform, state }。
 * 仅含 scale 的残缺对象会导致 setTransformData 内 Object.keys(null) 报错。
 */
export type MindMapTransformView = {
  transform: Record<string, unknown>;
  state: {
    scale: number;
    x: number;
    y: number;
    sx: number;
    sy: number;
  };
};

export function isMindMapTransformView(view: unknown): view is MindMapTransformView {
  if (!view || typeof view !== "object") return false;
  const record = view as Record<string, unknown>;
  return (
    !!record.state &&
    typeof record.state === "object" &&
    !!record.transform &&
    typeof record.transform === "object"
  );
}

export function sanitizeMindMapView(view: unknown): MindMapTransformView | null {
  if (!isMindMapTransformView(view)) return null;
  const state = view.state as Record<string, unknown>;
  return {
    transform: { ...(view.transform as Record<string, unknown>) },
    state: {
      scale: typeof state.scale === "number" ? state.scale : 1,
      x: typeof state.x === "number" ? state.x : 0,
      y: typeof state.y === "number" ? state.y : 0,
      sx: typeof state.sx === "number" ? state.sx : 0,
      sy: typeof state.sy === "number" ? state.sy : 0,
    },
  };
}

export function mergeMindMapViewScale(
  view: unknown,
  scale: unknown,
): MindMapTransformView | null {
  const base = sanitizeMindMapView(view);
  if (!base || typeof scale !== "number" || !Number.isFinite(scale)) return base;
  return {
    ...base,
    state: { ...base.state, scale },
  };
}
