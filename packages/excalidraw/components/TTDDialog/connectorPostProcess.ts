import { pointFrom, type LocalPoint } from "@excalidraw/math";
import {
  isArrowElement,
  isLinearElement,
  RENDER_ONLY_ROUNDED_POLYLINE_CUSTOM_DATA_KEY,
} from "@excalidraw/element";
import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

export type TTDConnectorStats = {
  strippedConnectors: number;
  smoothedConnectors: number;
  filletCorners: number;
  /** @deprecated 统一 arc fillet，恒为 0 */
  chamferCorners: number;
};

/**
 * ③ 拐角平滑（相对 ② 仅改拐角，起终点与走向不变）
 *
 * 正式路径使用 render-only 圆角：保留 Mermaid 原始折点，只在 customData 中
 * 标记可圆角的原始拐点，由渲染层绘制局部 Q 曲线。
 *
 * 调参：改 CORNER_TRIM_PX 即可。
 */
const CORNER_TRIM_PX = 8;
const MAX_TRIM_RATIO = 0.35;
const ARC_SAMPLES_MIN = 4;
const ARC_SAMPLES_MAX = 7;
const POINT_EPS = 0.01;
const AXIS_RATIO = 0.08;
const MIN_TURN_ANGLE = 0.35;
const MAX_TURN_ANGLE = 2.45;

const localPoint = (x: number, y: number): LocalPoint =>
  pointFrom<LocalPoint>(x, y);

const clonePoint = (p: LocalPoint): LocalPoint => localPoint(p[0], p[1]);

const subtract = (a: LocalPoint, b: LocalPoint): LocalPoint =>
  localPoint(a[0] - b[0], a[1] - b[1]);

const distance = (a: LocalPoint, b: LocalPoint): number =>
  Math.hypot(b[0] - a[0], b[1] - a[1]);

const normalize = (v: LocalPoint): LocalPoint => {
  const len = Math.hypot(v[0], v[1]) || 1;
  return localPoint(v[0] / len, v[1] / len);
};

const isHorizontal = (v: LocalPoint): boolean => {
  const len = Math.hypot(v[0], v[1]);
  return len > 0 && Math.abs(v[1]) / len <= AXIS_RATIO;
};

const isVertical = (v: LocalPoint): boolean => {
  const len = Math.hypot(v[0], v[1]);
  return len > 0 && Math.abs(v[0]) / len <= AXIS_RATIO;
};

const isAxisAligned = (v: LocalPoint): boolean =>
  isHorizontal(v) || isVertical(v);

const isOrthogonalCorner = (vIn: LocalPoint, vOut: LocalPoint): boolean =>
  (isHorizontal(vIn) && isVertical(vOut)) ||
  (isVertical(vIn) && isHorizontal(vOut));

const isCollinear = (vIn: LocalPoint, vOut: LocalPoint): boolean => {
  const lenIn = Math.hypot(vIn[0], vIn[1]);
  const lenOut = Math.hypot(vOut[0], vOut[1]);
  if (lenIn < 1 || lenOut < 1) {
    return true;
  }
  const cross = Math.abs(vIn[0] * vOut[1] - vIn[1] * vOut[0]);
  const dot = vIn[0] * vOut[0] + vIn[1] * vOut[1];
  return cross / (lenIn * lenOut) < 0.06 && dot > 0;
};

const turnAngle = (vIn: LocalPoint, vOut: LocalPoint): number => {
  const uIn = normalize(vIn);
  const uOut = normalize(vOut);
  const dot = Math.max(-1, Math.min(1, uIn[0] * uOut[0] + uIn[1] * uOut[1]));
  return Math.acos(dot);
};

/** 去掉直线段上的共线中间点，不改变拐角几何 */
export const simplifyCollinearPoints = (
  points: readonly LocalPoint[],
): LocalPoint[] => {
  if (points.length < 3) {
    return points.map(clonePoint);
  }

  const out: LocalPoint[] = [clonePoint(points[0])];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = out[out.length - 1];
    const curr = points[i];
    const next = points[i + 1];
    if (!isCollinear(subtract(curr, prev), subtract(next, curr))) {
      out.push(clonePoint(curr));
    }
  }
  out.push(clonePoint(points[points.length - 1]));
  return out;
};

const shouldSmoothCorner = (vIn: LocalPoint, vOut: LocalPoint): boolean => {
  if (isCollinear(vIn, vOut)) {
    return false;
  }

  const angle = turnAngle(vIn, vOut);
  if (angle < MIN_TURN_ANGLE || angle > MAX_TURN_ANGLE) {
    return false;
  }

  if (isOrthogonalCorner(vIn, vOut)) {
    return true;
  }

  const inAxis = isAxisAligned(vIn);
  const outAxis = isAxisAligned(vOut);
  if (inAxis && outAxis) {
    return false;
  }
  return (inAxis && !outAxis) || (!inAxis && outAxis);
};

const pushDistinct = (out: LocalPoint[], p: LocalPoint) => {
  const last = out[out.length - 1];
  if (!last || distance(last, p) > POINT_EPS) {
    out.push(clonePoint(p));
  }
};

const getSmoothableCornerIndices = (
  points: readonly LocalPoint[],
): number[] => {
  const indices: number[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    if (shouldSmoothCorner(subtract(curr, prev), subtract(next, curr))) {
      indices.push(i);
    }
  }
  return indices;
};

/** 弧长越大采样越多，上限 ARC_SAMPLES_MAX 控制抖动 */
const arcSampleCount = (angle: number, radius: number): number => {
  const arcLength = angle * radius;
  return Math.max(
    ARC_SAMPLES_MIN,
    Math.min(ARC_SAMPLES_MAX, Math.ceil(arcLength / 1.8)),
  );
};

type FilletResult = {
  p1: LocalPoint;
  bridgePoints: LocalPoint[];
  p2: LocalPoint;
};

/**
 * 标准 fillet：P1/P2 为切点，bridgePoints 为圆上一段采样。
 * θ 为路径转向角，r = trim / tan(θ/2)，圆心从切点沿入线法线求得。
 */
const computeCircularFillet = (
  a: LocalPoint,
  b: LocalPoint,
  c: LocalPoint,
): FilletResult | null => {
  const vIn = subtract(b, a);
  const vOut = subtract(c, b);
  const lenIn = Math.hypot(vIn[0], vIn[1]);
  const lenOut = Math.hypot(vOut[0], vOut[1]);
  if (lenIn < 1 || lenOut < 1 || !shouldSmoothCorner(vIn, vOut)) {
    return null;
  }

  const angle = turnAngle(vIn, vOut);
  const tanHalf = Math.tan(angle / 2);
  if (tanHalf < 1e-6) {
    return null;
  }

  let trim = Math.min(
    CORNER_TRIM_PX,
    lenIn * MAX_TRIM_RATIO,
    lenOut * MAX_TRIM_RATIO,
  );
  let r = trim / tanHalf;
  const maxTrim = Math.min(lenIn * MAX_TRIM_RATIO, lenOut * MAX_TRIM_RATIO);
  if (trim > maxTrim) {
    trim = maxTrim;
    r = trim / tanHalf;
  }
  if (trim < 1 || r < 0.5) {
    return null;
  }

  const uIn = normalize(vIn);
  const uOut = normalize(vOut);
  const p1 = localPoint(b[0] - uIn[0] * trim, b[1] - uIn[1] * trim);
  const p2 = localPoint(b[0] + uOut[0] * trim, b[1] + uOut[1] * trim);

  const cross = uIn[0] * uOut[1] - uIn[1] * uOut[0];
  if (Math.abs(cross) < 1e-6) {
    return null;
  }

  const side = cross > 0 ? 1 : -1;
  const leftNormal = localPoint(-uIn[1], uIn[0]);
  const center = localPoint(
    p1[0] + leftNormal[0] * side * r,
    p1[1] + leftNormal[1] * side * r,
  );

  const startAngle = Math.atan2(p1[1] - center[1], p1[0] - center[0]);
  const endAngle = Math.atan2(p2[1] - center[1], p2[0] - center[0]);
  let sweep = endAngle - startAngle;
  // 与转弯方向一致，且走劣弧（|sweep| ≤ π）
  if (cross > 0) {
    while (sweep <= 0) {
      sweep += 2 * Math.PI;
    }
    if (sweep > Math.PI) {
      sweep -= 2 * Math.PI;
    }
  } else if (cross < 0) {
    while (sweep >= 0) {
      sweep -= 2 * Math.PI;
    }
    if (sweep < -Math.PI) {
      sweep += 2 * Math.PI;
    }
  }

  const samples = arcSampleCount(angle, r);
  const bridgePoints: LocalPoint[] = [];
  for (let s = 1; s <= samples; s++) {
    const ang = startAngle + (sweep * s) / samples;
    bridgePoints.push(
      localPoint(center[0] + r * Math.cos(ang), center[1] + r * Math.sin(ang)),
    );
  }

  return { p1, bridgePoints, p2 };
};

export const applyCornerFillets = (
  points: readonly LocalPoint[],
): {
  points: LocalPoint[];
  filletCount: number;
  chamferCount: number;
} => {
  const simplified = simplifyCollinearPoints(points);
  if (simplified.length < 3) {
    return {
      points: simplified,
      filletCount: 0,
      chamferCount: 0,
    };
  }

  const out: LocalPoint[] = [];
  let filletCount = 0;

  pushDistinct(out, simplified[0]);

  for (let i = 1; i < simplified.length - 1; i++) {
    const fillet = computeCircularFillet(
      simplified[i - 1],
      simplified[i],
      simplified[i + 1],
    );
    if (!fillet) {
      pushDistinct(out, simplified[i]);
      continue;
    }

    filletCount += 1;
    pushDistinct(out, fillet.p1);
    for (const bridge of fillet.bridgePoints) {
      pushDistinct(out, bridge);
    }
    pushDistinct(out, fillet.p2);
  }

  pushDistinct(out, simplified[simplified.length - 1]);

  return { points: out, filletCount, chamferCount: 0 };
};

const stripRoundness = (
  element: NonDeletedExcalidrawElement,
): NonDeletedExcalidrawElement => {
  const { roundness: _roundness, ...rest } = element;
  if (isArrowElement(element) && element.elbowed) {
    return { ...rest, elbowed: false } as NonDeletedExcalidrawElement;
  }
  return rest as NonDeletedExcalidrawElement;
};

export const stripConnectorRoundness = (
  elements: readonly NonDeletedExcalidrawElement[],
): {
  elements: readonly NonDeletedExcalidrawElement[];
  connectorStats: TTDConnectorStats;
} => {
  let strippedConnectors = 0;

  const stripped = elements.map((element) => {
    if (!isLinearElement(element)) {
      return element;
    }

    if (element.roundness || (isArrowElement(element) && element.elbowed)) {
      strippedConnectors += 1;
    }

    return stripRoundness(element);
  });

  return {
    elements: stripped,
    connectorStats: {
      strippedConnectors,
      smoothedConnectors: 0,
      filletCorners: 0,
      chamferCorners: 0,
    },
  };
};

export const smoothConnectorCorners = (
  elements: readonly NonDeletedExcalidrawElement[],
): {
  elements: readonly NonDeletedExcalidrawElement[];
  connectorStats: TTDConnectorStats;
} => {
  let smoothedConnectors = 0;
  let filletCorners = 0;

  const smoothed = elements.map((element) => {
    if (!isLinearElement(element)) {
      return element;
    }

    const points = element.points;
    if (points.length <= 2) {
      return stripRoundness(element);
    }

    const cornerIndices = getSmoothableCornerIndices(points);
    if (cornerIndices.length === 0) {
      return stripRoundness(element);
    }

    smoothedConnectors += 1;
    filletCorners += cornerIndices.length;

    return {
      ...stripRoundness(element),
      customData: {
        ...element.customData,
        [RENDER_ONLY_ROUNDED_POLYLINE_CUSTOM_DATA_KEY]: {
          radius: CORNER_TRIM_PX,
          cornerIndices,
        },
      },
    } as NonDeletedExcalidrawElement;
  });

  return {
    elements: smoothed,
    connectorStats: {
      strippedConnectors: 0,
      smoothedConnectors,
      filletCorners,
      chamferCorners: 0,
    },
  };
};

export const softenConnectorCorners = smoothConnectorCorners;

export const sharpenConnectorPaths = (
  elements: readonly NonDeletedExcalidrawElement[],
): readonly NonDeletedExcalidrawElement[] =>
  stripConnectorRoundness(elements).elements;
