import { ROUNDNESS } from "@excalidraw/common";
import {
  isLinearElement,
  RENDER_ONLY_ROUNDED_POLYLINE_CUSTOM_DATA_KEY,
} from "@excalidraw/element";
import { pointFrom, type LocalPoint } from "@excalidraw/math";
import { describe, expect, it } from "vitest";

import {
  applyCornerFillets,
  simplifyCollinearPoints,
  smoothConnectorCorners,
  stripConnectorRoundness,
} from "./connectorPostProcess";

const lp = (x: number, y: number): LocalPoint => pointFrom<LocalPoint>(x, y);

describe("simplifyCollinearPoints", () => {
  it("removes middle points on straight vertical runs", () => {
    expect(
      simplifyCollinearPoints([
        lp(0, 0),
        lp(0, 24.5),
        lp(0, 45),
      ]),
    ).toEqual([
      lp(0, 0),
      lp(0, 45),
    ]);
  });
});

describe("applyCornerFillets", () => {
  it("arc-fillets a 90° corner without overshooting outside the path", () => {
    const { points } = applyCornerFillets([
      lp(-10, 0),
      lp(0, 0),
      lp(0, 10),
    ]);

    const mid = points[Math.floor(points.length / 2)];
    expect(mid[0]).toBeLessThan(0);
    expect(mid[1]).toBeGreaterThan(0);
    expect(points.every(([x]) => x <= 0.001)).toBe(true);
  });

  it("arc-fillets 否 branch without reversing direction first", () => {
    const { points } = applyCornerFillets([
      lp(0, 0),
      lp(-80.2, 89.3),
      lp(-80.2, 124.8),
    ]);

    const p1 = points[1];
    const bridgePoints = points.slice(2, -2);
    expect(bridgePoints.every(([x]) => x <= p1[0] + 0.001)).toBe(true);
  });

  it("arc-fillets diagonal-to-vertical corner, keeps endpoints", () => {
    const input = [
      lp(0, 0),
      lp(-80.2, 89.3),
      lp(-80.2, 124.8),
    ];

    const { points, filletCount, chamferCount } = applyCornerFillets(input);

    expect(filletCount).toBe(1);
    expect(chamferCount).toBe(0);
    expect(points[0]).toEqual(input[0]);
    expect(points[points.length - 1]).toEqual(input[2]);
    expect(points.length).toBeGreaterThan(4);
    expect(points.length).toBeLessThanOrEqual(4 + 7);
  });

  it("arc-fillets horizontal-vertical 90° corner", () => {
    const { filletCount } = applyCornerFillets([
      lp(0, 0),
      lp(100, 0),
      lp(100, 80),
    ]);
    expect(filletCount).toBe(1);
  });

  it("skips collinear and pure diagonal paths", () => {
    expect(
      applyCornerFillets([
        lp(0, 0),
        lp(0, 24.5),
        lp(0, 45),
      ]).filletCount,
    ).toBe(0);
    expect(
      applyCornerFillets([
        lp(0, 0),
        lp(83.9, 39.5),
        lp(164.2, 91.8),
      ]).filletCount,
    ).toBe(0);
  });
});

describe("smoothConnectorCorners", () => {
  it("keeps original points and marks render-only rounded corners", () => {
    const points = [
      lp(0, 0),
      lp(-80.2, 89.3),
      lp(-80.2, 124.8),
    ];

    const { elements: stripped } = stripConnectorRoundness([
      {
        type: "arrow",
        points: [...points],
        elbowed: false,
        roundness: { type: ROUNDNESS.PROPORTIONAL_RADIUS },
      } as never,
    ]);

    const { elements: smoothed, connectorStats } = smoothConnectorCorners([
      {
        type: "arrow",
        points: [...points],
        elbowed: false,
        roundness: { type: ROUNDNESS.PROPORTIONAL_RADIUS },
      } as never,
    ]);

    expect(connectorStats.filletCorners).toBeGreaterThan(0);

    const smoothedElement = smoothed[0];
    const strippedElement = stripped[0];
    if (!isLinearElement(smoothedElement) || !isLinearElement(strippedElement)) {
      throw new Error("expected linear elements");
    }
    expect(smoothedElement.points).toEqual(strippedElement.points);
    expect(smoothedElement.points[0]).toEqual(strippedElement.points[0]);
    expect(smoothedElement.points.at(-1)).toEqual(strippedElement.points.at(-1));
    expect(
      smoothedElement.customData?.[
        RENDER_ONLY_ROUNDED_POLYLINE_CUSTOM_DATA_KEY
      ],
    ).toEqual({ radius: 8, cornerIndices: [1] });
  });
});
