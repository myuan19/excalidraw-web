import {
  isEffectivelyEmptyMindMapData,
  MindMapAdapter,
} from "./MindMapAdapter";

describe("MindMapAdapter", () => {
  it("creates a Notion-style default mind map", () => {
    expect(MindMapAdapter.createEmpty()).toEqual({
      root: {
        data: {
          text: "<p>根节点</p>",
          richText: true,
          expand: true,
        },
        children: [],
      },
      layout: "logicalStructure",
      theme: {
        template: "classic4",
        config: {},
      },
    });
  });

  it("accepts current simple-mind-map data", async () => {
    await expect(
      MindMapAdapter.parse({
        root: {
          data: {
            text: "中心主题",
          },
          children: [],
        },
        layout: "logicalStructure",
        theme: {
          template: "default",
          config: {},
        },
        lang: "zh",
        localConfig: null,
      }),
    ).resolves.toMatchObject({
      root: {
        data: {
          text: "中心主题",
        },
      },
      layout: "logicalStructure",
    });
  });

  it("accepts Notion-style simple-mind-map data", async () => {
    await expect(
      MindMapAdapter.parse({
        root: {
          data: {
            text: "<p>根节点</p>",
            richText: true,
            expand: true,
            uid: "root",
          },
          children: [],
        },
        layout: "logicalStructure",
        theme: {
          template: "classic4",
          config: {},
        },
        view: {
          transform: {
            scaleX: 1,
            scaleY: 1,
            shear: 0,
            rotate: 0,
            translateX: 0,
            translateY: 0,
            originX: 0,
            originY: 0,
            a: 1,
            b: 0,
            c: 0,
            d: 1,
            e: 0,
            f: 0,
          },
          state: {
            scale: 1,
            x: 0,
            y: 0,
            sx: 0,
            sy: 0,
          },
        },
        config: {},
      }),
    ).resolves.toMatchObject({
      root: {
        data: {
          text: "<p>根节点</p>",
          richText: true,
        },
      },
      layout: "logicalStructure",
      theme: {
        template: "classic4",
      },
    });
  });

  it("detects transient empty native data", () => {
    expect(
      isEffectivelyEmptyMindMapData({
        root: {
          data: { text: "<p><br></p>", richText: true },
          children: [],
        },
      }),
    ).toBe(true);
  });

  it("does not treat the default root or children as empty", () => {
    expect(isEffectivelyEmptyMindMapData(MindMapAdapter.createEmpty())).toBe(
      false,
    );
    expect(
      isEffectivelyEmptyMindMapData({
        root: {
          data: { text: "" },
          children: [{ data: { text: "子节点" }, children: [] }],
        },
      }),
    ).toBe(false);
  });
});
