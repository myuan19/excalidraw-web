import { pointFrom, type LocalPoint } from "@excalidraw/math";

import { generateRoundedPolylinePath } from "../src/shape";

const lp = (x: number, y: number): LocalPoint => pointFrom<LocalPoint>(x, y);

describe("generateRoundedPolylinePath", () => {
  it("rounds corners without adding element points", () => {
    const points = [lp(-10, 0), lp(0, 0), lp(0, 10)];

    expect(generateRoundedPolylinePath(points, 5)).toBe(
      "M -10 0 L -5 0 Q 0 0, 0 5 L 0 10",
    );
    expect(points).toHaveLength(3);
  });

  it("keeps collinear points sharp", () => {
    expect(generateRoundedPolylinePath([lp(0, 0), lp(10, 0), lp(20, 0)], 5)).toBe(
      "M 0 0 L 10 0 L 20 0",
    );
  });

  it("rounds only requested corner indices", () => {
    expect(
      generateRoundedPolylinePath(
        [lp(0, 0), lp(10, 0), lp(10, 10), lp(20, 10)],
        5,
        [2],
      ),
    ).toBe("M 0 0 L 10 0 L 10 5 Q 10 10, 15 10 L 20 10");
  });
});
