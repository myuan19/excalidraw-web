import { describe, expect, it } from "vitest";

import {
  filterKnowledgeDocumentPaths,
  isKnowledgeDocumentFileName,
} from "./knowledgeDocumentExtensions";

describe("knowledgeDocumentExtensions", () => {
  it("recognizes desktop catalog document extensions", () => {
    expect(isKnowledgeDocumentFileName("map.smm")).toBe(true);
    expect(isKnowledgeDocumentFileName("Map.SMM")).toBe(true);
    expect(isKnowledgeDocumentFileName("board.mindmap.json")).toBe(true);
    expect(isKnowledgeDocumentFileName("sketch.excalidraw.json")).toBe(true);
    expect(isKnowledgeDocumentFileName("notes.txt")).toBe(false);
    expect(isKnowledgeDocumentFileName("export.json")).toBe(false);
  });

  it("filters absolute paths by basename", () => {
    expect(
      filterKnowledgeDocumentPaths([
        "C:/workspace/demo.smm",
        "C:/Downloads/readme.txt",
      ]),
    ).toEqual(["C:/workspace/demo.smm"]);
  });
});
