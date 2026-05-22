import type { EditorDefinition } from "../types";

export const mindMapEditorDefinition: EditorDefinition = {
  kind: "mindmap",
  displayName: "MindMap",
  supportedExtensions: [".smm"],
  loadComponent: () => import("./MindMapEditorShell"),
};
