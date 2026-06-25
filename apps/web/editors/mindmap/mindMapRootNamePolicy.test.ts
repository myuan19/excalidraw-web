import { describe, expect, it } from "vitest";

import {
  createEmptyMindMapData,
  createMindMapRootText,
} from "../../data/formats/MindMapAdapter";

import {
  reconcileMindMapRootAndFileName,
  resolveMindMapInitialSaveDisplayName,
  resolveMindMapOpenDisplayName,
  resolveMindMapSaveDisplayName,
} from "./mindMapRootNamePolicy";

describe("resolveMindMapOpenDisplayName", () => {
  it("keeps the file display name independent from the root text", () => {
    const data = createEmptyMindMapData("我的项目");
    expect(resolveMindMapOpenDisplayName(data, "未命名")).toBe("未命名");
  });

  it("uses list name when root is still default", () => {
    const data = createEmptyMindMapData();
    expect(resolveMindMapOpenDisplayName(data, "列表名称")).toBe("列表名称");
  });

  it("uses list name when both are customized and differ", () => {
    const data = {
      ...createEmptyMindMapData(),
      root: {
        data: {
          text: createMindMapRootText("根节点标题"),
          richText: true,
          expand: true,
        },
        children: [],
      },
    };
    expect(resolveMindMapOpenDisplayName(data, "文件列表名")).toBe(
      "文件列表名",
    );
  });

  it("keeps the file name when the root was cleared", () => {
    const data = {
      ...createEmptyMindMapData(),
      root: {
        data: {
          text: "<p><br></p>",
          richText: true,
          expand: true,
        },
        children: [],
      },
    };
    expect(resolveMindMapOpenDisplayName(data, "和")).toBe("和");
  });
});

describe("resolveMindMapSaveDisplayName", () => {
  it("keeps the current file name when saving even if the root was cleared", () => {
    const data = {
      ...createEmptyMindMapData(),
      root: {
        data: {
          text: "<p><br></p>",
          richText: true,
          expand: true,
        },
        children: [],
      },
    };
    expect(resolveMindMapSaveDisplayName(data, "和")).toBe("和");
  });

  it("keeps the current file name for non-empty roots", () => {
    expect(
      resolveMindMapSaveDisplayName(createEmptyMindMapData("根标题"), "文件名"),
    ).toBe("文件名");
  });

  it("keeps the default file name for existing files even if the root changed", () => {
    expect(
      resolveMindMapSaveDisplayName(
        createEmptyMindMapData("新的标题"),
        "未命名",
      ),
    ).toBe("未命名");
  });
});

describe("resolveMindMapInitialSaveDisplayName", () => {
  it("uses the first edited root text as the initial file name for local drafts", () => {
    expect(
      resolveMindMapInitialSaveDisplayName(
        createEmptyMindMapData("新的标题"),
        "未命名",
      ),
    ).toBe("新的标题");
  });

  it("keeps an explicit first-save file name independent from the root", () => {
    expect(
      resolveMindMapInitialSaveDisplayName(
        createEmptyMindMapData("根标题"),
        "外部文件名",
      ),
    ).toBe("外部文件名");
  });
});

describe("reconcileMindMapRootAndFileName", () => {
  it("does not promote root text to the file name after creation", () => {
    expect(reconcileMindMapRootAndFileName("未命名", "我的项目")).toEqual({
      kind: "noop",
    });
  });

  it("does not push a renamed file name back to the root node", () => {
    expect(reconcileMindMapRootAndFileName("列表新名", "旧根标题")).toEqual({
      kind: "noop",
    });
  });

  it("noops when already aligned", () => {
    expect(reconcileMindMapRootAndFileName("同一标题", "同一标题")).toEqual({
      kind: "noop",
    });
  });

  it("leaves the root empty when it was cleared and file name is already default", () => {
    expect(reconcileMindMapRootAndFileName("未命名", "")).toEqual({
      kind: "noop",
    });
  });

  it("leaves the file name untouched when the root was cleared", () => {
    expect(reconcileMindMapRootAndFileName("我的项目", "")).toEqual({
      kind: "noop",
    });
  });

  it("does not write automatic duplicate suffixes back to the root node", () => {
    expect(reconcileMindMapRootAndFileName("项目 (1)", "项目")).toEqual({
      kind: "noop",
    });
  });
});
