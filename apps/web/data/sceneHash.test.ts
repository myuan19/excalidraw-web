import { hashDocumentSnapshot, hashSceneSnapshot } from "./sceneHash";

describe("hashSceneSnapshot", () => {
  it("ignores Excalidraw viewport and shell-only appState changes", () => {
    const base = {
      type: "excalidraw",
      version: 2,
      source: "test",
      elements: [
        {
          id: "rect-1",
          type: "rectangle",
          x: 10,
          y: 20,
          width: 100,
          height: 80,
        },
      ],
      appState: {
        name: "远端名称",
        openSidebar: null,
        scrollX: 0,
        scrollY: 0,
        zoom: { value: 1 },
        viewBackgroundColor: "#ffffff",
      },
      files: {},
    };

    expect(
      hashSceneSnapshot({
        ...base,
        appState: {
          ...base.appState,
          name: "本地标签名",
          openSidebar: { name: "library" },
          scrollX: 240,
          scrollY: -180,
          zoom: { value: 0.5 },
        },
      }),
    ).toBe(hashSceneSnapshot(base));
  });

  it("ignores transient UI appState (open menu, popups, selection)", () => {
    const base = {
      type: "excalidraw",
      version: 2,
      source: "test",
      elements: [{ id: "rect-1", type: "rectangle", x: 0, y: 0 }],
      appState: { viewBackgroundColor: "#ffffff" },
      files: {},
    };

    // Opening the hamburger menu / a popup / selecting an element must NOT make
    // the document look modified.
    expect(
      hashSceneSnapshot({
        ...base,
        appState: {
          ...base.appState,
          openMenu: "canvas",
          openPopup: "canvasBackground",
          openDialog: { name: "help" },
          selectedElementIds: { "rect-1": true },
          selectedGroupIds: { g1: true },
          editingGroupId: "g1",
          cursorButton: "down",
          activeTool: { type: "rectangle" },
        },
      }),
    ).toBe(hashSceneSnapshot(base));
  });

  it("detects real content appState (canvas background, grid)", () => {
    const base = {
      type: "excalidraw",
      version: 2,
      source: "test",
      elements: [{ id: "rect-1", type: "rectangle", x: 0, y: 0 }],
      appState: { viewBackgroundColor: "#ffffff", gridModeEnabled: false },
      files: {},
    };

    expect(
      hashSceneSnapshot({
        ...base,
        appState: { ...base.appState, viewBackgroundColor: "#ffec99" },
      }),
    ).not.toBe(hashSceneSnapshot(base));

    expect(
      hashSceneSnapshot({
        ...base,
        appState: { ...base.appState, gridModeEnabled: true },
      }),
    ).not.toBe(hashSceneSnapshot(base));
  });
});

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
