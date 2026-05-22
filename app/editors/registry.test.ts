import { describe, expect, it } from "vitest";

import {
  createEditorRegistry,
  editorRegistry,
} from "./registry";
import { excalidrawEditorDefinition } from "./excalidraw";
import { mindMapEditorDefinition } from "./mindmap";

describe("editor registry", () => {
  it("looks up registered editors by kind and extension", () => {
    const registry = createEditorRegistry([
      excalidrawEditorDefinition,
      mindMapEditorDefinition,
    ]);

    expect(registry.getByKind("excalidraw")).toBe(excalidrawEditorDefinition);
    expect(registry.getByKind("mindmap")).toBe(mindMapEditorDefinition);
    expect(registry.getByExtension(".excalidraw")).toBe(
      excalidrawEditorDefinition,
    );
    expect(registry.getByExtension(".smm")).toBe(mindMapEditorDefinition);
  });

  it("exposes the app editors as parallel definitions", () => {
    expect(editorRegistry.list().map((editor) => editor.kind)).toEqual([
      "excalidraw",
      "mindmap",
    ]);
  });
});
