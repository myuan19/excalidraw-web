import { describe, expect, it } from "vitest";

import { createBlankExcalidrawInitialScene } from "./forkFileScene";
import { isExcalidrawDraftDirty } from "./draftDirty";

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

});
