import { getMindMapViewportFromPayload } from "./MindMapEmbedViewer";

describe("getMindMapViewportFromPayload", () => {
  it("accepts the legacy flat MindMap viewport payload", () => {
    expect(getMindMapViewportFromPayload({ scale: 1, x: 12, y: -8 })).toEqual({
      scale: 1,
      x: 12,
      y: -8,
    });
  });

  it("accepts the native full MindMap view payload", () => {
    expect(
      getMindMapViewportFromPayload({
        transform: { scaleX: 1, scaleY: 1, translateX: 12, translateY: -8 },
        state: { scale: 1, x: 12, y: -8, sx: 0, sy: 0 },
      }),
    ).toEqual({ scale: 1, x: 12, y: -8 });
  });
});
