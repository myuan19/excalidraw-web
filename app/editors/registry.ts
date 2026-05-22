import { excalidrawEditorDefinition } from "./excalidraw";
import { mindMapEditorDefinition } from "./mindmap";

import type { EditorDefinition } from "./types";

export function createEditorRegistry(definitions: EditorDefinition[]) {
  const byKind = new Map<string, EditorDefinition>();
  const byExtension = new Map<string, EditorDefinition>();

  for (const definition of definitions) {
    byKind.set(definition.kind, definition);
    for (const extension of definition.supportedExtensions) {
      byExtension.set(extension.toLowerCase(), definition);
    }
  }

  return {
    getByKind(kind: string): EditorDefinition | null {
      return byKind.get(kind) ?? null;
    },

    getByExtension(extension: string): EditorDefinition | null {
      return byExtension.get(extension.toLowerCase()) ?? null;
    },

    list(): EditorDefinition[] {
      return Array.from(byKind.values());
    },
  };
}

export const editorRegistry = createEditorRegistry([
  excalidrawEditorDefinition,
  mindMapEditorDefinition,
]);
