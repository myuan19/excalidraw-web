import { useRef } from "react";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import { isFiniteNumber } from "@excalidraw/math";

import { useAtom } from "../../../editor-jotai";

import { trackEvent } from "../../../analytics";
import { t } from "../../../i18n";

import { errorAtom, rateLimitsAtom, chatHistoryAtom } from "../TTDContext";
import {
  generateChatTitle,
  MAX_SAVED_CHATS,
  savedChatsAtom,
} from "../useTTDChatStorage";

import {
  addMessages,
  getLastAssistantMessage,
  getMessagesForLLM,
  removeLastAssistantMessage,
  updateAssistantContent,
} from "../utils/chat";
import {
  extractMermaidDefinition,
  isMermaidDefinition,
} from "../utils/extractMermaidFromLlmResponse";

import type { LLMMessage, SavedChat, TChat, TTTDDialog } from "../types";

import { ttdDebug } from "../utils/ttdDebug";

const MAX_CONTEXT_TURNS = 8;
const MAX_CONTEXT_CHAR_LENGTH = 30000;

const toSavedChat = (history: TChat.ChatHistory): SavedChat => ({
  id: history.id,
  title: generateChatTitle(
    history.messages.find(
      (message) =>
        message.type === "user" && typeof message.content === "string",
    )?.content ?? "Untitled chat",
  ),
  messages: history.messages
    .filter((message) => message.type === "user" || message.type === "assistant")
    .map((message) => ({
      ...message,
      timestamp:
        message.timestamp instanceof Date
          ? message.timestamp
          : new Date(message.timestamp),
    })),
  currentPrompt: history.currentPrompt,
  timestamp: Date.now(),
});

const getMessagesLength = (messages: LLMMessage[]): number =>
  messages.reduce((total, message) => total + message.content.length, 0);

const splitMessagesIntoTurns = (messages: LLMMessage[]): LLMMessage[][] => {
  const turns: LLMMessage[][] = [];
  let currentTurn: LLMMessage[] = [];

  messages.forEach((message) => {
    if (message.role === "user" && currentTurn.length > 0) {
      turns.push(currentTurn);
      currentTurn = [];
    }
    currentTurn.push(message);
  });

  if (currentTurn.length > 0) {
    turns.push(currentTurn);
  }

  return turns;
};

const getRecentMessagesByTurns = (
  messages: LLMMessage[],
  maxTurns: number,
): LLMMessage[] => splitMessagesIntoTurns(messages).slice(-maxTurns).flat();

const trimHistoryToCharLimit = (
  historyMessages: LLMMessage[],
  currentMessage: LLMMessage,
  maxChars: number,
): LLMMessage[] => {
  const turns = splitMessagesIntoTurns(historyMessages);

  while (
    turns.length > 0 &&
    getMessagesLength([...turns.flat(), currentMessage]) > maxChars
  ) {
    turns.shift();
  }

  return [...turns.flat(), currentMessage];
};

const getMessagesBeforeResendSource = (
  chatHistory: TChat.ChatHistory,
): TChat.ChatMessage[] => {
  if (!chatHistory.resendFromMessageId) {
    return chatHistory.messages;
  }

  const sourceIndex = chatHistory.messages.findIndex(
    (message) =>
      message.id === chatHistory.resendFromMessageId &&
      message.type === "user",
  );

  if (sourceIndex === -1) {
    return chatHistory.messages;
  }

  return chatHistory.messages.slice(0, sourceIndex);
};

export const useTextGeneration = ({
  onTextSubmit,
}: {
  onTextSubmit: (
    props: TTTDDialog.OnTextSubmitProps,
  ) => Promise<TTTDDialog.OnTextSubmitRetValue>;
}) => {
  const [, setError] = useAtom(errorAtom);
  const [rateLimits, setRateLimits] = useAtom(rateLimitsAtom);
  const [chatHistory, setChatHistory] = useAtom(chatHistoryAtom);
  const [, setSavedChats] = useAtom(savedChatsAtom);

  const streamingAbortControllerRef = useRef<AbortController | null>(null);
  const generationHistoryRef = useRef<TChat.ChatHistory | null>(null);
  const activeChatHistoryRef = useRef(chatHistory);
  activeChatHistoryRef.current = chatHistory;

  const serializeErrorDetails = (errorDetails?: Error | unknown) => {
    return errorDetails
      ? JSON.stringify({
          name: errorDetails instanceof Error ? errorDetails.name : "Error",
          message:
            errorDetails instanceof Error
              ? errorDetails.message
              : String(errorDetails),
          stack: errorDetails instanceof Error ? errorDetails.stack : undefined,
        })
      : undefined;
  };

  const syncGenerationHistory = (
    nextHistory: TChat.ChatHistory,
  ) => {
    const activeId = activeChatHistoryRef.current.id;
    const appliedToUi = activeId === nextHistory.id;
    const lastMsg = getLastAssistantMessage(nextHistory);

    ttdDebug("generation sync", {
      generationChatId: nextHistory.id,
      activeChatId: activeId,
      appliedToUi,
      messageCount: nextHistory.messages.length,
      isGenerating: !!lastMsg?.isGenerating,
      assistantContentLength:
        typeof lastMsg?.content === "string" ? lastMsg.content.length : 0,
    });

    generationHistoryRef.current = nextHistory;
    setChatHistory((currentHistory) =>
      currentHistory.id === nextHistory.id ? nextHistory : currentHistory,
    );

    setSavedChats((prevSavedChats) => {
      const savedChat = toSavedChat(nextHistory);
      const existingChat = prevSavedChats.find(
        (chat) => chat.id === savedChat.id,
      );
      const nextTimestamp = existingChat?.timestamp ?? savedChat.timestamp;

      return [
        ...prevSavedChats.filter((chat) => chat.id !== savedChat.id),
        {
          ...savedChat,
          timestamp: nextTimestamp,
        },
      ]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, MAX_SAVED_CHATS);
    });
  };

  const setGenerationAssistantError = (
    errorMessage: string,
    errorType: "parse" | "network" | "other" = "other",
    errorDetails?: Error | unknown,
  ) => {
    const nextHistory = updateAssistantContent(
      generationHistoryRef.current ?? chatHistory,
      {
        isGenerating: false,
        error: errorMessage,
        errorType,
        errorDetails: serializeErrorDetails(errorDetails),
      },
    );
    syncGenerationHistory(nextHistory);
  };

  const setErrorForGeneration = (error: Error | null) => {
    const generationChatId = generationHistoryRef.current?.id ?? chatHistory.id;
    if (activeChatHistoryRef.current.id === generationChatId) {
      setError(error);
    }
  };

  const onGenerate: TTTDDialog.OnGenerate = async ({
    prompt,
    isRepairFlow = false,
  }) => {
    if (rateLimits?.rateLimitRemaining === 0) {
      return;
    }

    if (streamingAbortControllerRef.current) {
      streamingAbortControllerRef.current.abort();
    }

    setError(null);

    const abortController = new AbortController();
    streamingAbortControllerRef.current = abortController;

    let initialGenerationHistory: TChat.ChatHistory;

    if (!isRepairFlow) {
      if (chatHistory.resendFromMessageId) {
        const resendBaseMessages = getMessagesBeforeResendSource(chatHistory);
        initialGenerationHistory = addMessages(
          {
            ...chatHistory,
            messages: resendBaseMessages,
            currentPrompt: "",
            resendFromMessageId: null,
          },
          [
            {
              type: "user",
              content: prompt,
            },
            {
              type: "assistant",
              content: "",
              isGenerating: true,
            },
          ],
        );
      } else {
        initialGenerationHistory = {
          ...addMessages(chatHistory, [
            {
              type: "user",
              content: prompt,
            },
            {
              type: "assistant",
              content: "",
              isGenerating: true,
            },
          ]),
          currentPrompt: "",
        };
      }
    } else {
      initialGenerationHistory = updateAssistantContent(chatHistory, {
        isGenerating: true,
        content: "",
        error: undefined,
        errorType: undefined,
        errorDetails: undefined,
      });
    }
    generationHistoryRef.current = initialGenerationHistory;
    ttdDebug("generation start", {
      chatId: initialGenerationHistory.id,
      isRepairFlow,
      resendFromMessageId: chatHistory.resendFromMessageId ?? null,
      messageCount: initialGenerationHistory.messages.length,
      promptLength: prompt.length,
    });
    syncGenerationHistory(initialGenerationHistory);

    try {
      trackEvent("ai", "generate", "ttd");

      const baseMessages = isRepairFlow
        ? chatHistory.messages
        : getMessagesBeforeResendSource(chatHistory);
      const previousMessages = getMessagesForLLM({
        ...chatHistory,
        messages: baseMessages,
      });
      const currentMessage: LLMMessage = { role: "user", content: prompt };
      const recentHistoryMessages = getRecentMessagesByTurns(
        previousMessages,
        MAX_CONTEXT_TURNS,
      );

      const messages: LLMMessage[] = trimHistoryToCharLimit(
        recentHistoryMessages,
        currentMessage,
        MAX_CONTEXT_CHAR_LENGTH,
      );

      const { generatedResponse, error, rateLimit, rateLimitRemaining } =
        await onTextSubmit({
          messages,
          onStreamCreated: () => {
            if (isRepairFlow) {
              const nextHistory = updateAssistantContent(
                generationHistoryRef.current ?? initialGenerationHistory,
                {
                  content: "",
                  error: "",
                  isGenerating: true,
                },
              );
              syncGenerationHistory(nextHistory);
            }
          },
          onChunk: (chunk: string) => {
            const currentGenerationHistory =
              generationHistoryRef.current ?? initialGenerationHistory;
            const lastAssistantMessage = getLastAssistantMessage(
              currentGenerationHistory,
            );
            const nextHistory = updateAssistantContent(
              currentGenerationHistory,
              {
                content: lastAssistantMessage.content + chunk,
              },
            );
            syncGenerationHistory(nextHistory);
          },
          signal: abortController.signal,
        });

      const completedHistory = updateAssistantContent(
        generationHistoryRef.current ?? initialGenerationHistory,
        {
          isGenerating: false,
        },
      );
      syncGenerationHistory(completedHistory);

      if (isFiniteNumber(rateLimit) && isFiniteNumber(rateLimitRemaining)) {
        setRateLimits({ rateLimit, rateLimitRemaining });
      }

      if (error?.status === 429 || rateLimitRemaining === 0) {
        let nextHistory = generationHistoryRef.current ?? completedHistory;
        if (error?.status === 429) {
          nextHistory = removeLastAssistantMessage(nextHistory);
        }

        nextHistory = {
          ...nextHistory,
          messages: nextHistory.messages.filter(
            (msg) =>
              msg.type !== "warning" ||
              msg.warningType === "rateLimitExceeded" ||
              msg.warningType === "messageLimitExceeded",
          ),
        };
        nextHistory = addMessages(nextHistory, [
          {
            type: "warning",
            warningType:
              rateLimitRemaining === 0
                ? "messageLimitExceeded"
                : "rateLimitExceeded",
          },
        ]);
        syncGenerationHistory(nextHistory);
      }

      if (error) {
        const isAborted =
          error.name === "AbortError" ||
          error.message === "Aborted" ||
          error.message === "请求已取消" ||
          error.message?.includes("回复已中断") ||
          error.status === 499 ||
          abortController.signal.aborted;

        /** 用户停止或离开导致中断：本条不继续走 Mermaid 解析，已流式写入的内容保留在对话里 */
        if (isAborted) {
          return;
        }

        const _error = new Error(
          error.message || t("chat.errors.requestFailed"),
        );
        if (error.status !== 429) {
          setGenerationAssistantError(_error.message, "network");
        }
        setErrorForGeneration(_error);

        return;
      }

      try {
        const normalized = extractMermaidDefinition(generatedResponse ?? "");
        if (!isMermaidDefinition(normalized)) {
          trackEvent("ai", "mermaid absent", "ttd");
          return;
        }

        await parseMermaidToExcalidraw(normalized);
        trackEvent("ai", "mermaid parse success", "ttd");
        const normalizedHistory = updateAssistantContent(
          generationHistoryRef.current ?? initialGenerationHistory,
          {
            content: normalized,
          },
        );
        syncGenerationHistory(normalizedHistory);
      } catch (error: any) {
        trackEvent("ai", "mermaid parse failed", "ttd");
        const _error = new Error(
          error.message || t("chat.errors.mermaidParseError"),
        );
        setGenerationAssistantError(_error.message, "parse");
        setErrorForGeneration(_error);
      }
    } catch (error: any) {
      const _error = new Error(
        error.message || t("chat.errors.generationFailed"),
      );
      setGenerationAssistantError(_error.message, "other");
      setErrorForGeneration(_error);
    } finally {
      streamingAbortControllerRef.current = null;
    }
  };

  const handleAbort = () => {
    if (streamingAbortControllerRef.current) {
      streamingAbortControllerRef.current.abort();
    }
  };

  return {
    onGenerate,
    handleAbort,
  };
};
