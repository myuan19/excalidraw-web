import { MindMapAdapter } from "../../data/formats/MindMapAdapter";
import MindMapEmbedViewer from "../../embed/MindMapEmbedViewer";

import { buildMindMapEmbedBridgePayload, prepareMindMapEmbedData } from "./embed";
import { createMindMapFile, importMindMapFile } from "./hostActions";

import type { EditorPlugin } from "../types";

export const mindMapPlugin: EditorPlugin = {
  kind: "mindmap",
  displayName: "MindMap",
  icon: "/icons/mindmap.ico",
  // 启动空闲期预热编辑器 chunk：懒加载若推迟到首次开标签，桌面便携版的
  // %TEMP% 解压目录一旦被系统清理，动态 import 直接失败（标签页渲染失败）。
  prefetchOnFileListReady: true,
  adapter: MindMapAdapter,
  loadEditorShell: () => import("./MindMapEditorShell"),
  loadEmbedViewer: async () => ({ default: MindMapEmbedViewer }),
  downloadExtension: "smm",
  createFile: createMindMapFile,
  importFile: importMindMapFile,
  prepareEmbedData: prepareMindMapEmbedData,
  buildEmbedPayload: buildMindMapEmbedBridgePayload,
};
