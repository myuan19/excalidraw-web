import { useCallback, useRef } from "react";
import {
  DiagramToCodePlugin,
  exportToBlob,
  getTextFromElements,
  MIME_TYPES,
  TTDDialog,
  TTDDialogTrigger,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import {
  isExcalidrawAIConfigured,
  openAIChatCompletionStream,
  openAIVisionHtml,
  resolveExcalidrawAIModels,
  TTDPersistence,
} from "@/features/ai";
import type { AIConfig } from "@/types/file";
import { emitAppNotice } from "@/features/ui/appNotice";
import { TtdChatPanel } from "@/features/ai/TtdChatPanel";

function showAIConfigNotice() {
  emitAppNotice({
    level: "warning",
    key: "ai-not-configured",
    message: "AI 尚未配置，请在设置页填写 Base URL 与 API Key。",
  });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read blob failed"));
    reader.readAsDataURL(blob);
  });
}

function showAIError(message: string) {
  emitAppNotice({
    level: "error",
    key: "ai-request-failed",
    message,
  });
}

async function appendTtdChatTurn(prompt: string, response: string) {
  const chats = await TTDPersistence.loadChats();
  const next = Array.isArray(chats) ? [...chats] : [];
  next.unshift({
    id: crypto.randomUUID(),
    updatedAt: Date.now(),
    messages: [
      { role: "user", content: prompt },
      { role: "assistant", content: response },
    ],
  });
  await TTDPersistence.saveChats(next.slice(0, 40));
}

export function ExcalidrawAIPlugins({
  excalidrawAPI,
  excalidrawAI,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  excalidrawAI: AIConfig["excalidraw"];
}) {
  const models = resolveExcalidrawAIModels(excalidrawAI);
  const apiRef = useRef(excalidrawAPI);
  apiRef.current = excalidrawAPI;

  const onTextSubmit = useCallback(async (value: string) => {
    if (!isExcalidrawAIConfigured(excalidrawAI)) {
      showAIConfigNotice();
      return { error: new Error("AI 未配置") };
    }
    const result = await openAIChatCompletionStream({
      endpoint: excalidrawAI.endpoint,
      apiKey: excalidrawAI.apiKey,
      model: models.textToDiagram,
      messages: [{ role: "user", content: value }],
    });
    if (result.error) {
      showAIError(result.error.message);
      return { error: result.error };
    }
    if (result.generatedResponse) {
      void appendTtdChatTurn(value, result.generatedResponse);
    }
    return result.error
      ? { error: result.error }
      : { generatedResponse: result.generatedResponse, error: null };
  }, [excalidrawAI, models.textToDiagram]);

  const generateDiagramToCode = useCallback(async ({
    frame,
    children,
  }: {
    frame: { id: string };
    children: readonly unknown[];
  }) => {
    const api = apiRef.current;
    if (!api) {
      throw new Error("编辑器尚未就绪");
    }
    if (!isExcalidrawAIConfigured(excalidrawAI)) {
      showAIConfigNotice();
      throw new Error("AI 未配置");
    }
    try {
      const appState = api.getAppState();
      const blob = await exportToBlob({
        elements: children as never,
        appState: {
          ...appState,
          exportBackground: true,
          viewBackgroundColor: appState.viewBackgroundColor,
        } as never,
        exportingFrame: frame as never,
        files: api.getFiles(),
        mimeType: MIME_TYPES.jpg,
      });
      const dataURL = await blobToDataUrl(blob);
      const textContext = getTextFromElements(children as never);
      const { html } = await openAIVisionHtml({
        endpoint: excalidrawAI.endpoint,
        apiKey: excalidrawAI.apiKey,
        model: models.diagramToCode,
        imageDataUrl: dataURL,
        textContext,
      });
      return { html };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showAIError(message);
      throw error;
    }
  }, [excalidrawAI, models.diagramToCode]);

  return (
    <>
      <DiagramToCodePlugin generate={generateDiagramToCode as never} />
      <TTDDialogTrigger>AI 生成</TTDDialogTrigger>
      <TtdChatPanel excalidrawAPI={excalidrawAPI} />
      <TTDDialog onTextSubmit={onTextSubmit} />
    </>
  );
}
