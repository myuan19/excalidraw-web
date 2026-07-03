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
  // 启动空闲期预热编辑器 chunk（同 mindmap 注释：防便携版 %TEMP% 资源被清
  // 后懒加载失败）。
  prefetchOnFileListReady: true,
  adapter: ExcalidrawAdapter,
  loadEditorShell: () => import("./EditorShell"),
  loadEmbedViewer: () => import("../../embed/ExcalidrawEmbedViewer"),
  downloadExtension: "excalidraw",
  createFile: createExcalidrawFile,
  importFile: importExcalidrawFile,
  importMimeTypes: ["application/x-excalidraw"],
};
