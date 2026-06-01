import { describe, expect, it } from "vitest";

import {
  createEditorRegistry,
  editorRegistry,
} from "./registry";
import { excalidrawPlugin } from "./excalidraw";
import { mindMapPlugin } from "./mindmap";

describe("editor registry", () => {
  it("looks up registered editors by kind and extension", () => {
    const registry = createEditorRegistry([
      excalidrawPlugin,
      mindMapPlugin,
    ]);

    expect(registry.getByKind("excalidraw")).toBe(excalidrawPlugin);
    expect(registry.getByKind("mindmap")).toBe(mindMapPlugin);
    expect(registry.getByExtension(".excalidraw")).toBe(excalidrawPlugin);
    expect(registry.getByExtension(".smm")).toBe(mindMapPlugin);
  });

  it("exposes the app editors as parallel plugins", () => {
    expect(editorRegistry.list().map((editor) => editor.kind)).toEqual([
      "excalidraw",
      "mindmap",
    ]);
  });

  it("builds file hashes from the default kind", () => {
    expect(editorRegistry.buildFileHash("abc")).toBe("#file=abc");
    expect(editorRegistry.buildFileHash("abc", "mindmap")).toBe(
      "#file=abc&kind=mindmap",
    );
  });

  it("builds new-document hashes without a file id", () => {
    expect(editorRegistry.buildNewDocumentHash()).toBe("#new=1");
    expect(editorRegistry.buildNewDocumentHash("mindmap")).toBe(
      "#new=1&kind=mindmap",
    );
  });

  it("lists creatable editors with createFile hooks", () => {
    expect(editorRegistry.listCreatable().map((plugin) => plugin.kind)).toEqual([
      "excalidraw",
      "mindmap",
    ]);
  });
});
