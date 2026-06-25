import { describe, expect, it } from "vitest";

import { MindMapAdapter } from "../../data/formats/registry";
import { parseMindMapSavePayload } from "./mindMapBridge";

describe("parseMindMapSavePayload", () => {
  it("preserves user edit metadata on draft pushes", () => {
    const data = MindMapAdapter.createEmpty("root");

    const parsed = parseMindMapSavePayload({
      revision: 1,
      data,
      userEdit: true,
      reason: "command:INSERT_CHILD_NODE",
    });

    expect(parsed?.mindMapData.root.children).toEqual(data.root.children);
    expect(parsed?.revision).toBe(1);
    expect(parsed?.userEdit).toBe(true);
    expect(parsed?.reason).toBe("command:INSERT_CHILD_NODE");
  });

  it("does not treat non-true userEdit values as user edits", () => {
    const parsed = parseMindMapSavePayload({
      data: MindMapAdapter.createEmpty("root"),
      userEdit: "true",
      reason: 123,
    });

    expect(parsed?.userEdit).toBe(false);
    expect(parsed?.reason).toBeUndefined();
  });
});
