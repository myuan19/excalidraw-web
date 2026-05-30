import type { AIConfig } from "@/types/file";

export function isExcalidrawAIConfigured(config: AIConfig["excalidraw"]): boolean {
  return !!(config.endpoint.trim() && config.apiKey.trim());
}

export function resolveExcalidrawAIModels(config: AIConfig["excalidraw"]) {
  return {
    textToDiagram: config.textToDiagramModel || "gpt-4o",
    diagramToCode: config.diagramToCodeModel || config.textToDiagramModel || "gpt-4o",
    iconTag: config.iconTagModel || config.textToDiagramModel || "gpt-4o",
  };
}
