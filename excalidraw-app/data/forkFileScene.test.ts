import { createBlankExcalidrawInitialScene } from "./forkFileScene";

describe("fork file scenes", () => {
  it("creates an initial scene for new blank Excalidraw files", () => {
    expect(createBlankExcalidrawInitialScene("未命名")).toEqual({
      elements: [],
      appState: { name: "未命名" },
      files: {},
    });
  });
});
