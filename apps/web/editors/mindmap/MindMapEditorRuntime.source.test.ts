import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nativeWebRoot = path.join(__dirname, "native", "web");
const nativeRoot = path.join(__dirname, "native");

function readNativeSource(relativePath: string): string {
  return fs.readFileSync(path.join(nativeWebRoot, relativePath), "utf8");
}

describe("MindMap iframe save contract", () => {
  it("takeoverShell finishes text edit before snapshot and skips draft while editing", () => {
    const bridge = readNativeSource("src/bridge/takeoverShell.js");

    expect(bridge).toContain("hideEditTextBox");
    expect(bridge).toContain("takeOverApp.saveMindMapData.skippedWhileEditing");
    expect(bridge).not.toContain("const resolved = snapshot || data");
    expect(bridge.indexOf("hideEditTextBox")).toBeLessThan(
      bridge.indexOf("getDataForSnapshot"),
    );
  });

  it("guards native highlight rendering when svg polygon is unavailable", () => {
    const render = fs.readFileSync(
      path.join(nativeRoot, "simple-mind-map", "src", "core", "render", "Render.js"),
      "utf8",
    );

    expect(render).toContain("typeof this.highlightBoxNode.plot !== 'function'");
    expect(render).toContain("highlightNode skipped");
    expect(render).toContain("invalid-bounds");
  });

  it("logs host-side native save progress and iframe failures", () => {
    const shell = fs.readFileSync(
      path.join(__dirname, "MindMapEditorShell.tsx"),
      "utf8",
    );

    expect(shell).toContain('event.data.type === "mindMapSaveProgress"');
    expect(shell).toContain('"mindmap-native"');
    expect(shell).toContain('"saveProgress"');
    expect(shell).toContain('"iframeError"');
    expect(shell).toContain('"queueAutoSave.timerFired"');
    expect(shell).toContain('"persistServer"');
  });
});
