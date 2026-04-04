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
          await ensureAIConfigLoaded();
          if (!isAIConfigured()) {
            throw new Error(
              "请先在首页（文件列表）打开「AI 设置」，配置 Base URL 与 API Key。",
            );
          }
          const cfg = getCachedAIConfig();
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
          await ensureAIConfigLoaded();
          if (!isAIConfigured()) {
            return {
              error: new RequestError({
                message:
                  "请先在首页（文件列表）打开「AI 设置」，配置 Base URL 与 API Key。",
                status: 400,
              }),
            };
          }
          const cfg = getCachedAIConfig();
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
