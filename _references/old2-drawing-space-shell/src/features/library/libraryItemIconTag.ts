import { openAIIconTag } from "@/features/ai";
import type { AIConfig } from "@/types/file";
import type { LibraryItem } from "@/types/file";

export async function tagLibraryItemWithAI(
  _item: LibraryItem,
  aiConfig: AIConfig["excalidraw"],
  imageDataUrl: string,
): Promise<string> {
  return openAIIconTag({
    endpoint: aiConfig.endpoint,
    apiKey: aiConfig.apiKey,
    model: aiConfig.iconTagModel || aiConfig.textToDiagramModel,
    imageDataUrl,
  });
}
