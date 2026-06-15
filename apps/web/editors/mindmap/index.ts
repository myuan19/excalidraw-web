import { MindMapAdapter } from "../../data/formats/MindMapAdapter";
import MindMapEmbedViewer from "../../embed/MindMapEmbedViewer";

import { buildMindMapEmbedBridgePayload, prepareMindMapEmbedData } from "./embed";
import { createMindMapFile, importMindMapFile } from "./hostActions";

import type { EditorPlugin } from "../types";

export const mindMapPlugin: EditorPlugin = {
  kind: "mindmap",
  displayName: "MindMap",
  icon: "/icons/mindmap.ico",
  adapter: MindMapAdapter,
  loadEditorShell: () => import("./MindMapEditorShell"),
  loadEmbedViewer: async () => ({ default: MindMapEmbedViewer }),
  downloadExtension: "smm",
  createFile: createMindMapFile,
  importFile: importMindMapFile,
  prepareEmbedData: prepareMindMapEmbedData,
  buildEmbedPayload: buildMindMapEmbedBridgePayload,
};
