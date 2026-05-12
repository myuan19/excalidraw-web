import {
  DiagramToCodePlugin,
  exportToBlob,
  getTextFromElements,
  MIME_TYPES,
  TTDDialog,
} from "@excalidraw/excalidraw";
import { RequestError } from "@excalidraw/excalidraw/errors";
import { getDataURL } from "@excalidraw/excalidraw/data/blob";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { TTDIndexedDBAdapter } from "../data/TTDStorage";
import {
  openAIChatCompletionStream,
  openAIVisionHtml,
} from "../data/openaiCompatibleStream";
import {
  ensureAIConfigLoaded,
  getCachedAIConfig,
  isAIConfigured,
  resolveAIModels,
} from "../data/aiConfig";

export const AIComponents = ({
  excalidrawAPI,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
}) => {
  return (
    <>
      <DiagramToCodePlugin
        generate={async ({ frame, children }) => {
          console.log("[DEBUG] AIComponents.generate | start", {
            childCount: children.length,
            frameId: frame.id,
          });
          await ensureAIConfigLoaded();
          const configured = isAIConfigured();
          console.log("[DEBUG] AIComponents.generate | config checked", {
            configured,
          });
          if (!configured) {
            excalidrawAPI.setToast({
              message:
                "AI 尚未配置，请返回首页在「AI 设置」中填写 Base URL 与 API Key",
              closable: true,
              duration: 5000,
            });
            throw new Error("AI 未配置");
          }
          const cfg = getCachedAIConfig().excalidraw;
          const models = resolveAIModels(cfg);
          const appState = excalidrawAPI.getAppState();

          const blob = await exportToBlob({
            elements: children,
            appState: {
              ...appState,
              exportBackground: true,
              viewBackgroundColor: appState.viewBackgroundColor,
            },
            exportingFrame: frame,
            files: excalidrawAPI.getFiles(),
            mimeType: MIME_TYPES.jpg,
          });

          const dataURL = await getDataURL(blob);
          const textFromFrameChildren = getTextFromElements(children);

          const { html } = await openAIVisionHtml({
            endpoint: cfg.endpoint,
            apiKey: cfg.apiKey,
            model: models.diagramToCode,
            imageDataUrl: dataURL,
            textContext: textFromFrameChildren,
          });

          return { html };
        }}
      />

      <TTDDialog
        onTextSubmit={async (props) => {
          console.log("[DEBUG] AIComponents.onTextSubmit | start", {
            messageCount: props.messages.length,
          });
          await ensureAIConfigLoaded();
          const configured = isAIConfigured();
          console.log("[DEBUG] AIComponents.onTextSubmit | config checked", {
            configured,
          });
          if (!configured) {
            excalidrawAPI.setToast({
              message:
                "AI 尚未配置，请返回首页在「AI 设置」中填写 Base URL 与 API Key",
              closable: true,
              duration: 5000,
            });
            return {
              error: new RequestError({
                message: "AI 未配置",
                status: 400,
              }),
            };
          }
          const cfg = getCachedAIConfig().excalidraw;
          const models = resolveAIModels(cfg);
          const { onChunk, onStreamCreated, signal, messages } = props;

          return openAIChatCompletionStream({
            endpoint: cfg.endpoint,
            apiKey: cfg.apiKey,
            model: models.textToDiagram,
            messages,
            onChunk,
            onStreamCreated,
            signal,
          });
        }}
        persistenceAdapter={TTDIndexedDBAdapter}
      />
    </>
  );
};
