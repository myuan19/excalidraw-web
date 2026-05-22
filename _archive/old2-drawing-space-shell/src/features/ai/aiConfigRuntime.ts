import type { AIConfig } from "@/types/file";

export interface MindMapAIConfigPayload {
  configured: boolean;
  api: string;
  key: string;
  model: string;
  method: "POST";
}

export function toMindMapAIConfigPayload(config: AIConfig): MindMapAIConfigPayload {
  const api = config.mindmap.endpoint || config.excalidraw.endpoint;
  const key = config.mindmap.apiKey || config.excalidraw.apiKey;
  const model = config.mindmap.model || config.excalidraw.textToDiagramModel;

  return {
    configured: !!(api && key && model),
    api,
    key,
    model,
    method: "POST",
  };
}
