import { describe, expect, it } from "vitest";

import { MindMapAdapter } from "./formats/MindMapAdapter";
import { createBlankExcalidrawInitialScene } from "./forkFileScene";
import { isExcalidrawDraftDirty, isMindMapDraftDirty } from "./draftDirty";

describe("draftDirty", () => {
  it("treats blank excalidraw scene as clean", () => {
    expect(isExcalidrawDraftDirty(createBlankExcalidrawInitialScene("未命名"))).toBe(
      false,
    );
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

  it("treats empty mindmap as clean", () => {
    expect(
      isMindMapDraftDirty(MindMapAdapter.toDocument(MindMapAdapter.createEmpty())),
    ).toBe(false);
  });

  it("treats single-root mindmap with layout edits as clean", () => {
    const doc = MindMapAdapter.toDocument({
      ...MindMapAdapter.createEmpty(),
      layout: "mindMap",
    });
    expect(isMindMapDraftDirty(doc)).toBe(false);
  });

  it("detects mindmap edits when child nodes exist", () => {
    const data = MindMapAdapter.createEmpty();
    data.root.children = [
      { data: { text: "子节点" }, children: [] },
    ];
    expect(isMindMapDraftDirty(MindMapAdapter.toDocument(data))).toBe(true);
  });
});
