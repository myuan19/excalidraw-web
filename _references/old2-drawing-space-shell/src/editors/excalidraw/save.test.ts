import { describe, expect, it } from "vitest";
import { normalizeExcalidrawScene, sanitizeExcalidrawAppState } from "./save";

describe("sanitizeExcalidrawAppState", () => {
  it("removes plain-object collaborators from JSON payloads", () => {
    const out = sanitizeExcalidrawAppState({
      collaborators: { abc: { username: "x" } },
      viewBackgroundColor: "#fff",
    });
    expect(out).not.toHaveProperty("collaborators");
    expect(out.viewBackgroundColor).toBe("#fff");
  });

  it("keeps Map collaborators", () => {
    const collaborators = new Map([["id", { username: "x" }]]);
    const out = sanitizeExcalidrawAppState({ collaborators });
    expect(out.collaborators).toBe(collaborators);
  });
});

describe("normalizeExcalidrawScene", () => {
  it("sanitizes appState on normalize", () => {
    const scene = normalizeExcalidrawScene({
      elements: [],
      appState: { collaborators: [] },
      files: {},
    });
    expect(scene.appState).not.toHaveProperty("collaborators");
  });
});
