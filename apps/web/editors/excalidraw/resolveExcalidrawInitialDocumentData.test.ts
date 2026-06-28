import { describe, expect, it } from "vitest";

import { resolveExcalidrawInitialDocumentData } from "./resolveExcalidrawInitialDocumentData";

describe("resolveExcalidrawInitialDocumentData", () => {
  it("prefers the in-memory document over stale server file data", () => {
    const resolved = resolveExcalidrawInitialDocumentData(
      {
        elements: [{ id: "server", type: "rectangle" }],
        appState: {},
        files: {},
      },
      "Sketch",
      {
        elements: [{ id: "edited", type: "ellipse" }],
        appState: { zoom: { value: 2 } },
        files: { img1: { id: "img1" } },
      },
    );

    expect(resolved.elements).toEqual([{ id: "edited", type: "ellipse" }]);
    expect(resolved.appState).toEqual({ zoom: { value: 2 } });
    expect(resolved.files).toEqual({ img1: { id: "img1" } });
  });

  it("falls back to server file data when no in-memory document exists", () => {
    const resolved = resolveExcalidrawInitialDocumentData(
      {
        elements: [{ id: "server", type: "rectangle" }],
        appState: {},
        files: {},
      },
      "Sketch",
      null,
    );

    expect(resolved.elements).toEqual([{ id: "server", type: "rectangle" }]);
  });
});
