import {
  buildMindMapEmbedBridgePayload,
  buildEmbedEditUrl,
  getEmbedDocumentKind,
  getExcalidrawEmbedData,
  getMindMapEmbedData,
} from "./embedDocument";

describe("embed document helpers", () => {
  it("defaults unknown embed kinds to excalidraw", () => {
    expect(getEmbedDocumentKind(undefined)).toBe("excalidraw");
    expect(getEmbedDocumentKind("text")).toBe("excalidraw");
  });

  it("preserves mindmap embed kind", () => {
    expect(getEmbedDocumentKind("mindmap")).toBe("mindmap");
  });

  it("builds MindMap edit URLs with document kind", () => {
    expect(buildEmbedEditUrl("file-1", "mindmap", "https://example.com"))
      .toBe("https://example.com/#file=file-1&kind=mindmap");
  });

  it("builds Excalidraw edit URLs without a kind parameter", () => {
    expect(buildEmbedEditUrl("file-1", "excalidraw", "https://example.com"))
      .toBe("https://example.com/#file=file-1");
  });

  it("extracts MindMap data from a managed document", () => {
    expect(
      getMindMapEmbedData({
        kind: "mindmap",
        containerVersion: 1,
        formatVersion: 1,
        data: {
          root: {
            data: {
              text: "<p>根节点</p>",
              richText: true,
            },
            children: [],
          },
          layout: "logicalStructure",
          theme: {
            template: "classic4",
            config: {},
          },
        },
      }),
    ).toMatchObject({
      root: {
        data: {
          text: "<p>根节点</p>",
          richText: true,
        },
      },
      layout: "logicalStructure",
    });
  });

  it("extracts Excalidraw scene data from a managed document", () => {
    const scene = {
      elements: [
        {
          id: "rect-1",
          type: "rectangle",
          x: 10,
          y: 20,
          width: 100,
          height: 60,
          angle: 0,
          strokeColor: "#1e1e1e",
          backgroundColor: "transparent",
          fillStyle: "solid",
          strokeWidth: 2,
          strokeStyle: "solid",
          roughness: 1,
          opacity: 100,
          groupIds: [],
          frameId: null,
          roundness: null,
          seed: 1,
          versionNonce: 1,
          version: 1,
          isDeleted: false,
          boundElements: null,
          updated: 1,
          link: null,
          locked: false,
        },
      ],
      appState: {
        viewBackgroundColor: "#ffffff",
      },
      files: {},
    };

    expect(
      getExcalidrawEmbedData({
        kind: "excalidraw",
        containerVersion: 1,
        formatVersion: 2,
        data: scene,
      }),
    ).toBe(scene);
  });

  it("builds a readonly MindMap iframe payload for embed mode", () => {
    const data = getMindMapEmbedData({
      root: {
        data: {
          text: "根节点",
        },
        children: [],
      },
      config: {
        enableFreeDrag: true,
      },
      localConfig: {
        isDark: false,
      },
      lang: "zh",
    });

    expect(buildMindMapEmbedBridgePayload(data)).toEqual({
      mindMapData: {
        ...data,
        config: {
          enableFreeDrag: true,
          __nbPreviewTargetX: 0.5,
          __nbPreviewTargetY: 0.5,
          __nbPreviewRootScreenRatioMultiplier: 0.1,
        },
      },
      mindMapConfig: {
        enableFreeDrag: true,
        __nbPreviewTargetX: 0.5,
        __nbPreviewTargetY: 0.5,
        __nbPreviewRootScreenRatioMultiplier: 0.1,
      },
      lang: "zh",
      localConfig: {
        isDark: false,
      },
      embedMode: true,
      readOnly: true,
    });
  });

  it("strips stale MindMap view data from readonly embed payloads", () => {
    const data = getMindMapEmbedData({
      root: {
        data: {
          text: "根节点",
        },
        children: [
          {
            data: {
              text: "子节点",
            },
            children: [],
          },
        ],
      },
      layout: "logicalStructure",
      view: {
        state: { scale: 2, x: -100, y: -200 },
      },
    });

    const payload = buildMindMapEmbedBridgePayload(data);

    expect(payload.mindMapData.view).toBeUndefined();
    expect(payload.mindMapData.config?.__nbPreviewTargetX).toBeLessThan(0.5);
    expect(payload.mindMapData.config?.__nbPreviewTargetY).toBe(0.5);
    expect(payload.mindMapData.config?.__nbPreviewRootScreenRatioMultiplier)
      .toBe(0.1);
  });
});
