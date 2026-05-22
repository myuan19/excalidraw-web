import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { extractMermaidDefinition } from "./extractMermaidFromLlmResponse";

export async function insertMermaidResponseToCanvas(
  api: ExcalidrawImperativeAPI,
  raw: string,
): Promise<void> {
  const definition = extractMermaidDefinition(raw);
  if (!definition) {
    throw new Error("未找到可解析的 Mermaid 内容");
  }
  const { parseMermaidToExcalidraw } = await import("@excalidraw/mermaid-to-excalidraw");
  const { elements: skeleton } = await parseMermaidToExcalidraw(definition);
  const elements = convertToExcalidrawElements(skeleton, { regenerateIds: true });
  const current = api.getSceneElements();
  api.updateScene({ elements: [...current, ...elements] });
}
