import { describe, expect, it } from "vitest";

import { validateMindMapSaveSnapshot } from "./mindMapSaveSnapshotValidation";

import type { MindMapDocumentData } from "../../data/formats/MindMapAdapter";

function mindMapWithChildren(children: MindMapDocumentData["root"]["children"]) {
  return {
    root: {
      data: { text: "<p><span>root</span></p>", richText: true },
      children,
    },
    theme: { template: "classic4", config: {} },
    layout: "logicalStructure",
    config: {},
    view: null,
    lang: "zh",
    localConfig: null,
  } satisfies MindMapDocumentData;
}

describe("validateMindMapSaveSnapshot", () => {
  it("accepts legitimate structural edits that reduce node count", () => {
    const previous = mindMapWithChildren([
      { data: { text: "<p>a</p>", richText: true }, children: [] },
      { data: { text: "<p>b</p>", richText: true }, children: [] },
    ]);
    const incoming = mindMapWithChildren([
      { data: { text: "<p>a</p>", richText: true }, children: [] },
    ]);

    const validation = validateMindMapSaveSnapshot({
      previousData: previous,
      incomingData: incoming,
    });

    expect(validation.accepted).toBe(true);
    expect(validation.rejectionReasons).toEqual([]);
    expect(validation.regressionReasons).toEqual(
      expect.arrayContaining(["nodeCount 3 -> 2", "rootChildren 2 -> 1"]),
    );
  });

  it("rejects a transient empty explicit save after non-empty content", () => {
    const validation = validateMindMapSaveSnapshot({
      previousData: mindMapWithChildren([
        { data: { text: "<p>a</p>", richText: true }, children: [] },
      ]),
      incomingData: {
        root: {
          data: { text: "<p><br></p>", richText: true },
          children: [],
        },
      },
    });

    expect(validation.accepted).toBe(false);
    expect(validation.rejectionReasons).toEqual([
      "incoming-empty-after-non-empty-previous",
    ]);
  });
});
