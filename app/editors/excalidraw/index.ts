import type { EditorDefinition } from "../types";

export const excalidrawEditorDefinition: EditorDefinition = {
  kind: "excalidraw",
  displayName: "Excalidraw",
  supportedExtensions: [".excalidraw", ".json"],
  loadComponent: () => import("./EditorShell"),
};
