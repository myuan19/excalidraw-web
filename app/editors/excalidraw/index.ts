import { MIME_TYPES } from "@excalidraw/common";

import { ExcalidrawAdapter } from "../../data/formats/ExcalidrawAdapter";
import {
  createExcalidrawFile,
  importExcalidrawFile,
} from "./hostActions";
import { prepareExcalidrawEmbedData } from "./embed";

import type { EditorPlugin } from "../types";

export const excalidrawPlugin: EditorPlugin = {
  kind: "excalidraw",
  displayName: "Excalidraw",
  icon: "/icons/excalidraw.svg",
  isDefault: true,
  prefetchOnFileListReady: true,
  omitKindInHash: true,
  downloadExtension: "excalidraw",
  adapter: ExcalidrawAdapter,
  loadEditorShell: () => import("./EditorShell"),
  loadEmbedViewer: () => import("../../embed/ExcalidrawEmbedViewer"),
  createFile: createExcalidrawFile,
  importFile: importExcalidrawFile,
  prepareEmbedData: prepareExcalidrawEmbedData,
  importMimeTypes: [
    MIME_TYPES.excalidraw,
    MIME_TYPES.json,
    MIME_TYPES.png,
    MIME_TYPES.svg,
    "application/x-excalidraw",
  ],
};

/** @deprecated Use excalidrawPlugin */
export const excalidrawEditorDefinition = {
  kind: excalidrawPlugin.kind,
  displayName: excalidrawPlugin.displayName,
  supportedExtensions: excalidrawPlugin.adapter.extensions,
  loadComponent: excalidrawPlugin.loadEditorShell,
};
