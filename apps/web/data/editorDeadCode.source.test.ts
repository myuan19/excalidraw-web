import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(appRoot, relativePath), "utf8");
}

function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.join(appRoot, relativePath));
}

describe("editor dead-code guard", () => {
  it("does not keep hash-route scene init hooks in the active shell", () => {
    expect(fileExists("hooks/useSceneInitialization.ts")).toBe(false);
    expect(fileExists("hooks/useBeforeUnloadGuard.ts")).toBe(false);
    expect(fileExists("editors/excalidraw/initializeExcalidrawScene.ts")).toBe(
      false,
    );

    const appSource = read("App.tsx");
    const excalidrawShell = read("editors/excalidraw/EditorShell.tsx");

    expect(appSource).not.toContain("useSceneInitialization");
    expect(excalidrawShell).not.toContain("useSceneInitialization");
    expect(excalidrawShell).not.toContain("initializeExcalidrawScene");
  });

  it("routes excalidraw browser viewport through excalidrawBrowserViewport", () => {
    const excalidrawShell = read("editors/excalidraw/EditorShell.tsx");
    expect(excalidrawShell).toContain("excalidrawBrowserViewport");
    expect(excalidrawShell).not.toContain("LocalData.save");
  });
});
