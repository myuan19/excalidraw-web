import { describe, expect, it } from "vitest";

import {
  compareMindMapTreeIntegrityRegression,
  summarizeMindMapTreeIntegrity,
} from "./mindMapPersistDebug";

import type { MindMapDocumentData } from "../../data/formats/MindMapAdapter";

function sampleTree(): MindMapDocumentData {
  return {
    root: {
      data: { text: "<p>root</p>", richText: true, expand: true },
      children: [
        {
          data: { text: "<p>child-a</p>", richText: true, expand: false },
          children: [
            {
              data: { text: "<p>grandchild</p>", richText: true },
              children: [],
            },
          ],
        },
        {
          data: { text: "<p><br></p>", richText: true },
          children: [],
        },
      ],
    },
    theme: { template: "classic4", config: {} },
    layout: "logicalStructure",
    config: {},
    view: null,
    lang: "zh",
    localConfig: null,
  };
}

describe("summarizeMindMapTreeIntegrity", () => {
  it("counts nodes, empty text, collapsed branches, and depth", () => {
    expect(summarizeMindMapTreeIntegrity(sampleTree())).toEqual({
      nodeCount: 4,
      emptyTextCount: 1,
      rootChildren: 2,
      collapsedWithChildrenCount: 1,
      maxDepth: 3,
    });
  });
});

describe("compareMindMapTreeIntegrityRegression", () => {
  it("flags node loss and empty-text growth", () => {
    const previous = summarizeMindMapTreeIntegrity(sampleTree());
    const incoming = summarizeMindMapTreeIntegrity({
      ...sampleTree(),
      root: {
        data: { text: "<p>root</p>", richText: true },
        children: [
          {
            data: { text: "<p><br></p>", richText: true },
            children: [],
          },
          {
            data: { text: "<p><br></p>", richText: true },
            children: [],
          },
        ],
      },
    });
    const regression = compareMindMapTreeIntegrityRegression(
      previous,
      incoming,
    );
    expect(regression.regressed).toBe(true);
    expect(regression.reasons).toEqual(
      expect.arrayContaining([
        "nodeCount 4 -> 3",
        "emptyTextCount 1 -> 2",
      ]),
    );
  });
});
