import { describe, expect, it } from "vitest";

import { resolveExcalidrawSceneForThumbnail } from "./excalidrawSceneThumbnail";
import { hashSceneSnapshot } from "./sceneHash";

describe("resolveExcalidrawSceneForThumbnail", () => {
  it("computes scene hash from canonicalized scene snapshot", () => {
    const scene = {
      elements: [{ id: "a", type: "rectangle", x: 0, y: 0, width: 10, height: 10 }],
      appState: { name: "Untitled", viewBackgroundColor: "#ffffff" },
      files: {},
    };
    const resolved = resolveExcalidrawSceneForThumbnail("file-1", scene);
    expect(resolved.sceneHash).toBe(hashSceneSnapshot(resolved.scene));
  });
});
