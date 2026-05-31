import { MindMapAdapter } from "../../data/formats/MindMapAdapter";
import {
  buildMindMapEmbedBridgePayload,
  prepareMindMapEmbedData,
} from "./embed";
import {
  createMindMapFile,
  importMindMapFile,
} from "./hostActions";

import type { EditorPlugin } from "../types";

export const mindMapPlugin: EditorPlugin = {
  kind: "mindmap",
  displayName: "MindMap",
  icon: "/icons/mindmap.ico",
  prefetchOnFileListReady: true,
  downloadExtension: "smm",
  adapter: MindMapAdapter,
  loadEditorShell: () => import("./MindMapEditorShell"),
  loadEmbedViewer: () => import("../../embed/MindMapEmbedViewer"),
  createFile: createMindMapFile,
  importFile: importMindMapFile,
  prepareEmbedData: prepareMindMapEmbedData,
  buildEmbedPayload: (data) =>
    buildMindMapEmbedBridgePayload(data as ReturnType<typeof prepareMindMapEmbedData>),
  importMimeTypes: ["application/vnd.simple-mind-map+json"],
};

/** @deprecated Use mindMapPlugin */
export const mindMapEditorDefinition = {
  kind: mindMapPlugin.kind,
  displayName: mindMapPlugin.displayName,
  supportedExtensions: mindMapPlugin.adapter.extensions,
  loadComponent: mindMapPlugin.loadEditorShell,
};
