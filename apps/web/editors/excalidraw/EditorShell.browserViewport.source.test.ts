import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Excalidraw EditorShell browser viewport source contract", () => {
  it("restores fork browser overlay on open and persists viewport independently of dirty", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "EditorShell.tsx"),
      "utf8",
    );
    const viewportSource = fs.readFileSync(
      path.join(__dirname, "excalidrawBrowserViewport.ts"),
      "utf8",
    );

    expect(viewportSource).toContain("resolveExcalidrawBrowserViewportOverlay");
    expect(viewportSource).toContain("readForkBrowserAppStateOverlay");
    expect(viewportSource).toContain("saveForkBrowserScene");
    expect(viewportSource).toContain("clearForkBrowserScene");
    expect(viewportSource).toContain("isExcalidrawDraftDirty");

    expect(source).toContain("resolveExcalidrawBrowserViewportOverlay");
    expect(source).toContain("scheduleExcalidrawBrowserSceneSave");
    expect(source).toContain("flushExcalidrawBrowserSceneSave");
    expect(source).toContain("revealForkCanvasAfterFit");
    expect(source).toMatch(/scrollToContent:\s*true/);
    expect(source).toContain("...(overlay ? {} : { scrollToContent: true })");
  });
});
