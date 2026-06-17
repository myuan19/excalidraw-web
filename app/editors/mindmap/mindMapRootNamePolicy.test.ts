import { describe, expect, it } from "vitest";

import {
  createEmptyMindMapData,
  createMindMapRootText,
} from "../../data/formats/MindMapAdapter";

import {
  reconcileMindMapRootAndFileName,
  resolveMindMapOpenDisplayName,
} from "./mindMapRootNamePolicy";

describe("resolveMindMapOpenDisplayName", () => {
  it("prefers non-default root text over stale 未命名 list cache", () => {
    const data = createEmptyMindMapData("我的项目");
    expect(resolveMindMapOpenDisplayName(data, "未命名")).toBe("我的项目");
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
    expect(resolveMindMapOpenDisplayName(data, "文件列表名")).toBe("文件列表名");
  });
});

describe("reconcileMindMapRootAndFileName", () => {
  it("promotes root when file name is stale default", () => {
    expect(
      reconcileMindMapRootAndFileName("未命名", "我的项目"),
    ).toEqual({ kind: "promote-root-to-file", name: "我的项目" });
  });

  it("pushes file name to root when file was renamed in list", () => {
    expect(
      reconcileMindMapRootAndFileName("列表新名", "旧根标题"),
    ).toEqual({ kind: "push-file-to-root", text: "列表新名" });
  });

  it("noops when already aligned", () => {
    expect(
      reconcileMindMapRootAndFileName("同一标题", "同一标题"),
    ).toEqual({ kind: "noop" });
  });

  it("writes 未命名 to root when root was cleared and file name is default", () => {
    expect(reconcileMindMapRootAndFileName("未命名", "")).toEqual({
      kind: "push-file-to-root",
      text: "未命名",
    });
  });

  it("resets file name to 未命名 when root was cleared", () => {
    expect(reconcileMindMapRootAndFileName("我的项目", "")).toEqual({
      kind: "promote-root-to-file",
      name: "未命名",
    });
  });
});
