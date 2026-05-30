import { describe, expect, it } from "vitest";
import { createEmptyMindMapData } from "./bridge";
import { shouldIgnoreMindMapSavePayload } from "./mindMapSaveGuards";

describe("mindMapSaveGuards", () => {
  it("ignores stale revision updates", () => {
    expect(shouldIgnoreMindMapSavePayload({
      payload: { revision: 1 },
      activeRequestId: null,
      latestRevision: 3,
      previousData: createEmptyMindMapData(),
      nextData: createEmptyMindMapData(),
      isCurrentSaveResponse: false,
    })).toBe(true);
  });

  it("ignores transient empty payloads when previous document had content", () => {
    const previous = {
      ...createEmptyMindMapData(),
      root: {
        ...createEmptyMindMapData().root,
        children: [{ data: { text: "子节点" }, children: [] }],
      },
    };
    expect(shouldIgnoreMindMapSavePayload({
      payload: { revision: 4 },
      activeRequestId: null,
      latestRevision: 2,
      previousData: previous,
      nextData: {
        root: {
          data: { text: "<p><br></p>", richText: true },
          children: [],
        },
      },
      isCurrentSaveResponse: false,
    })).toBe(true);
  });
});
