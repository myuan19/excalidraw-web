import { describe, expect, it } from "vitest";

import { createBlankExcalidrawInitialScene } from "./forkFileScene";
import {
  isExcalidrawDraftDirty,
  isExcalidrawTemplateScene,
} from "./draftDirty";

describe("draftDirty", () => {
  it("treats blank excalidraw scene as clean", () => {
    expect(
      isExcalidrawDraftDirty(createBlankExcalidrawInitialScene("未命名")),
    ).toBe(false);
    expect(isExcalidrawTemplateScene(createBlankExcalidrawInitialScene("未命名"))).toBe(
      true,
    );
  });

  it("treats runtime appState noise on empty canvas as clean", () => {
    const scene = createBlankExcalidrawInitialScene("未命名");
    expect(
      isExcalidrawDraftDirty({
        ...scene,
        appState: {
          ...scene.appState,
          viewBackgroundColor: "#ffffff",
          currentItemStrokeColor: "#1e1e1e",
          gridSize: 20,
        },
      }),
    ).toBe(false);
  });

  it("detects excalidraw edits", () => {
    const scene = createBlankExcalidrawInitialScene("未命名");
    expect(
      isExcalidrawDraftDirty({
        ...scene,
        elements: [{ id: "a", type: "rectangle" }],
      }),
    ).toBe(true);
  });

  it("detects embedded files as edits", () => {
    const scene = createBlankExcalidrawInitialScene("未命名");
    expect(
      isExcalidrawDraftDirty({
        ...scene,
        files: { img1: { id: "img1" } },
      }),
    ).toBe(true);
  });
});
