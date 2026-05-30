import { describe, expect, it } from "vitest";
import { serializeDeltaPayload } from "./serializeDeltaPayload";

describe("serializeDeltaPayload", () => {
  it("drops non-cloneable values", () => {
    const result = serializeDeltaPayload({
      elements: [],
      appState: {
        collaborators: { a: 1 },
        onPaste: async () => undefined,
      },
      files: {},
    });
    expect(result).toEqual({
      elements: [],
      appState: {},
      files: {},
    });
  });

  it("returns null for functions", () => {
    expect(serializeDeltaPayload(async () => undefined)).toBeNull();
  });
});
