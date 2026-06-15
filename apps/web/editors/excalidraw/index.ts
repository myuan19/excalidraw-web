import { ExcalidrawAdapter } from "../../data/formats/ExcalidrawAdapter";

import {
  createExcalidrawFile,
  importExcalidrawFile,
} from "./hostActions";

import type { EditorPlugin } from "../types";

export const excalidrawPlugin: EditorPlugin = {
  kind: "excalidraw",
  displayName: "Excalidraw",
  icon: "/icons/excalidraw.svg",
  isDefault: true,
  omitKindInHash: true,
  adapter: ExcalidrawAdapter,
  loadEditorShell: () => import("./EditorShell"),
  loadEmbedViewer: () => import("../../embed/ExcalidrawEmbedViewer"),
  downloadExtension: "excalidraw",
  createFile: createExcalidrawFile,
  importFile: importExcalidrawFile,
  importMimeTypes: ["application/x-excalidraw"],
};
