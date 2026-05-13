import { hashDocumentSnapshot } from "./sceneHash";

describe("hashDocumentSnapshot", () => {
  it("ignores MindMap viewport-only changes", () => {
    const base = {
      kind: "mindmap",
      containerVersion: 1,
      formatVersion: 1,
      sourceVersion: "test",
      data: {
        root: {
          data: { text: "<p>根节点</p>", richText: true },
          children: [],
        },
        layout: "logicalStructure",
        view: {
          state: { scale: 1, x: 0, y: 0 },
        },
      },
    };

    expect(
      hashDocumentSnapshot({
        ...base,
        data: {
          ...base.data,
          view: {
            state: { scale: 1, x: 240, y: -180 },
          },
        },
      }),
    ).toBe(hashDocumentSnapshot(base));
  });
});
