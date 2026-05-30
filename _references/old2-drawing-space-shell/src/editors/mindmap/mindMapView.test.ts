import { describe, expect, it } from "vitest";
import { mergeMindMapViewScale, sanitizeMindMapView } from "./mindMapView";

const validView = {
  transform: { a: 1 },
  state: { scale: 1.5, x: 20, y: 0, sx: 0, sy: 0 },
};

describe("mindMapView", () => {
  it("accepts transform view shape", () => {
    expect(sanitizeMindMapView(validView)).toMatchObject({
      state: { scale: 1.5, x: 20 },
    });
  });

  it("rejects partial scale-only view", () => {
    expect(sanitizeMindMapView({ scale: 1.5, x: 20 })).toBeNull();
  });

  it("merges scale into valid view only", () => {
    expect(mergeMindMapViewScale(validView, 2)?.state.scale).toBe(2);
    expect(mergeMindMapViewScale({ scale: 1 }, 2)).toBeNull();
  });
});
