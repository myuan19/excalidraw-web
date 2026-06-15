import { isLegacyExcalidrawScene, isManagedDocument } from "./documentTypes";
import { detectFormat } from "./formats/detectFormat";
import { MindMapAdapter } from "./formats/MindMapAdapter";
import { parseImportFileJsonMaybe } from "./importFileReadCache";
import { editorRegistry } from "../editors/registry";

function mindMapMatchesData(data: unknown): boolean {
  if (isManagedDocument(data) && data.kind === "mindmap") {
    return MindMapAdapter.validate(data.data);
  }
  return MindMapAdapter.validate(data);
}

function excalidrawMatchesData(data: unknown): boolean {
  if (isManagedDocument(data) && data.kind === "excalidraw") {
    return isLegacyExcalidrawScene(data.data);
  }
  return isLegacyExcalidrawScene(data);
}

function kindsFromParsedContent(data: unknown): string[] {
  const kinds: string[] = [];
  if (excalidrawMatchesData(data)) {
    kinds.push("excalidraw");
  }
  if (mindMapMatchesData(data)) {
    kinds.push("mindmap");
  }
  return kinds;
}

/** 返回可导入该文件的编辑器 kind 列表（去重、仅含已注册且支持 import 的插件）。 */
export async function detectImportCandidateKinds(file: File): Promise<string[]> {
  const name = file.name.toLowerCase();
  const importable = editorRegistry
    .list()
    .filter((plugin) => typeof plugin.importFile === "function");
  const importableKinds = new Set(importable.map((p) => p.kind));

  if (file.type.startsWith("image/") || name.endsWith(".svg") || name.endsWith(".png")) {
    return importableKinds.has("excalidraw") ? ["excalidraw"] : [];
  }

  if (name.endsWith(".smm")) {
    return importableKinds.has("mindmap") ? ["mindmap"] : [];
  }

  if (
    name.endsWith(".excalidraw") ||
    file.type === "application/vnd.excalidraw+json" ||
    file.type === "application/x-excalidraw"
  ) {
    return importableKinds.has("excalidraw") ? ["excalidraw"] : [];
  }

  const isJsonLike =
    name.endsWith(".json") ||
    name.endsWith(".smm") ||
    file.type.includes("json");

  if (isJsonLike) {
    const parsed = await parseImportFileJsonMaybe(file);
    if (parsed !== undefined) {
      const fromContent = kindsFromParsedContent(parsed);
      if (fromContent.length > 0) {
        return fromContent.filter((k) => importableKinds.has(k));
      }
    }
  }

  const detected = await detectFormat(file);
  if (detected.kind !== "unknown" && importableKinds.has(detected.kind)) {
    return [detected.kind];
  }

  return [];
}
