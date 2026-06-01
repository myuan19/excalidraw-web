import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(__dirname, "EditorPlatformSidebar.tsx");
const source = fs.readFileSync(sourcePath, "utf8");

describe("Editor platform sidebar travel bounds", () => {
  it("uses ten-band layout with six-band drag span", () => {
    expect(source).toContain("const TRAVEL_BAND_TOP = 1");
    expect(source).toContain("const TRAVEL_BAND_DRAG = 6");
    expect(source).toContain("const TRAVEL_BAND_BOTTOM = 1");
    expect(source).toContain("getEdgeTravelBounds");
    expect(source).toContain("travelRatioToBallCoord");
    expect(source).toContain("ballCoordToTravelRatio");
  });

  it("maps panel offset linearly to ball-panel top/bottom alignment", () => {
    expect(source).toContain(
      "return clampRatio(travelRatio) * (ballSize - panelSize)",
    );
    expect(source).not.toContain("travelRatio <= 0.5");
    expect(source).not.toContain("Math.max(0.08, Math.min(0.92, ratio))");
  });

  it("stores anchor under v2 travel-ratio semantics", () => {
    expect(source).toContain("excalidraw-editor-bridge-anchor-v2");
  });
});
