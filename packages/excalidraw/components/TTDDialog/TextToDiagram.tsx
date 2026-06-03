import { useEffect, useRef } from "react";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { useAtom, useAtomValue } from "../../editor-jotai";

import { useApp, useExcalidrawSetAppState } from "../App";

import { useChatAgent } from "./Chat";

import {
  convertMermaidToExcalidraw,
  extractMermaidDefinition,
  insertToEditor,
  saveMermaidDataToStorage,
} from "./common";
import { errorAtom, chatHistoryAtom, showPreviewAtom } from "./TTDContext";
import { chatsLoadedAtom } from "./useTTDChatStorage";

import { useTTDChatStorage } from "./useTTDChatStorage";
import { useMermaidRenderer } from "./hooks/useMermaidRenderer";
import { useTextGeneration } from "./hooks/useTextGeneration";
import { useChatManagement } from "./hooks/useChatManagement";
import { TTDChatPanel } from "./Chat/TTDChatPanel";
import { TTDPreviewPanel } from "./TTDPreviewPanel";

import { getLastAssistantMessage } from "./utils/chat";
import { ttdDebug } from "./utils/ttdDebug";

import type { BinaryFiles } from "../../types";
import type {
  MermaidToExcalidrawLibProps,
  TChat,
  TTDPersistenceAdapter,
  TTTDDialog,
} from "./types";

const TextToDiagramContent = ({
  mermaidToExcalidrawLib,
  onTextSubmit,
  renderWelcomeScreen,
  renderWarning,
  persistenceAdapter,
}: {
  mermaidToExcalidrawLib: MermaidToExcalidrawLibProps;
  onTextSubmit: (
    props: TTTDDialog.OnTextSubmitProps,
  ) => Promise<TTTDDialog.OnTextSubmitRetValue>;
  renderWelcomeScreen?: TTTDDialog.renderWelcomeScreen;
  renderWarning?: TTTDDialog.renderWarning;
  persistenceAdapter: TTDPersistenceAdapter;
}) => {
  const app = useApp();
  const setAppState = useExcalidrawSetAppState();

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useAtom(errorAtom);
  const [chatHistory, setChatHistory] = useAtom(chatHistoryAtom);
  const showPreview = useAtomValue(showPreviewAtom);
  const chatsLoaded = useAtomValue(chatsLoadedAtom);
  const didAutoRestoreOnOpenRef = useRef(false);

  const { savedChats } = useTTDChatStorage({ persistenceAdapter });

  const lastAssistantMessage = getLastAssistantMessage(chatHistory);

  const { setLastRetryAttempt } = useChatAgent();

  const { data } = useMermaidRenderer({
    canvasRef,
    mermaidToExcalidrawLib,
  });

  const { onGenerate, handleAbort } = useTextGeneration({
    onTextSubmit,
  });

  const {
    isMenuOpen,
    onRestoreChat,
    handleDeleteChat,
    handleNewChat,
    handleMenuToggle,
    handleMenuClose,
  } = useChatManagement({ persistenceAdapter });

  useEffect(() => {
    if (didAutoRestoreOnOpenRef.current || !chatsLoaded || savedChats.length === 0) {
      return;
    }
    if (chatHistory.messages.length > 0) {
      didAutoRestoreOnOpenRef.current = true;
      return;
    }
    const newest = savedChats[0];
    if (!newest) {
      return;
    }
    didAutoRestoreOnOpenRef.current = true;
    if (newest.id === chatHistory.id) {
      return;
    }
    ttdDebug("session auto restore newest", {
      fromChatId: chatHistory.id,
      toChatId: newest.id,
      title: newest.title,
      messageCount: newest.messages.length,
    });
    onRestoreChat(newest);
  }, [
    chatsLoaded,
    savedChats,
    chatHistory.id,
    chatHistory.messages.length,
    onRestoreChat,
  ]);

  useEffect(() => {
    const newest = savedChats[0];
    ttdDebug("session state snapshot", {
      activeChatId: chatHistory.id,
      activeMessageCount: chatHistory.messages.length,
      activePromptLength: chatHistory.currentPrompt.length,
      savedChatsCount: savedChats.length,
      newestSavedChatId: newest?.id ?? null,
      isActiveNewest: newest?.id === chatHistory.id,
      isGenerating: lastAssistantMessage?.isGenerating ?? false,
      showPreview,
    });
  }, [
    chatHistory.id,
    chatHistory.messages.length,
    lastAssistantMessage?.isGenerating,
    showPreview,
    savedChats.length,
  ]);

  const onViewAsMermaid = () => {
    if (typeof lastAssistantMessage?.content === "string") {
      saveMermaidDataToStorage(
        extractMermaidDefinition(lastAssistantMessage.content),
      );
      setAppState({
        openDialog: { name: "ttd", tab: "mermaid" },
      });
    }
  };

  const handleMermaidTabClick = (message: TChat.ChatMessage) => {
    const mermaidContent = extractMermaidDefinition(message.content || "");
    if (mermaidContent) {
      saveMermaidDataToStorage(mermaidContent);
      setAppState({
        openDialog: { name: "ttd", tab: "mermaid" },
      });
    }
  };

  const handleInsertMessage = async (message: TChat.ChatMessage) => {
    const mermaidContent = message.content || "";
    if (!mermaidContent.trim() || !mermaidToExcalidrawLib.loaded) {
      return;
    }

    const tempDataRef = {
      current: {
        elements: [] as readonly NonDeletedExcalidrawElement[],
        files: null as BinaryFiles | null,
      },
    };

    const result = await convertMermaidToExcalidraw({
      canvasRef,
      data: tempDataRef,
      mermaidToExcalidrawLib,
      setError,
      mermaidDefinition: mermaidContent,
      theme: app.state.theme,
    });

    if (result.success) {
      insertToEditor({
        app,
        data: tempDataRef,
        text: result.normalizedDefinition,
        shouldSaveMermaidDataToStorage: true,
      });
    }
  };

  const handleAiRepairClick = async (message: TChat.ChatMessage) => {
    const mermaidContent = extractMermaidDefinition(message.content || "");
    const errorMessage = message.error || "";

    if (!mermaidContent) {
      return;
    }

    const repairPrompt = `Fix the error in this Mermaid diagram. The diagram is:\n\n\`\`\`mermaid\n${mermaidContent}\n\`\`\`\n\nThe exception/error is: ${errorMessage}\n\nPlease fix the Mermaid syntax and regenerate a valid diagram.`;

    await onGenerate({ prompt: repairPrompt, isRepairFlow: true });
  };

  const handleRetry = async (message: TChat.ChatMessage) => {
    const messageIndex = chatHistory.messages.findIndex(
      (msg) => msg.id === message.id,
    );

    if (messageIndex > 0) {
      const previousMessage = chatHistory.messages[messageIndex - 1];
      if (
        previousMessage.type === "user" &&
        typeof previousMessage.content === "string"
      ) {
        setLastRetryAttempt();
        await onGenerate({
          prompt: previousMessage.content,
          isRepairFlow: true,
        });
      }
    }
  };

  const handleUserMessageClick = (message: TChat.ChatMessage) => {
    if (message.type !== "user" || typeof message.content !== "string") {
      return;
    }

    ttdDebug("prompt resend source set", {
      chatId: chatHistory.id,
      messageId: message.id,
      contentLength: message.content.length,
      previousPromptLength: chatHistory.currentPrompt.length,
    });
    setChatHistory((prev) => ({
      ...prev,
      currentPrompt: message.content ?? "",
      resendFromMessageId: message.id,
    }));
  };

  const handleInsertToEditor = () => {
    insertToEditor({ app, data });
  };

  const handleDeleteMessage = (messageId: string) => {
    const assistantMessageIndex = chatHistory.messages.findIndex(
      (msg) => msg.id === messageId && msg.type === "assistant",
    );

    const remainingMessages = chatHistory.messages.slice(
      0,
      assistantMessageIndex - 1,
    );

    setChatHistory({
      ...chatHistory,
      messages: remainingMessages,
    });
  };

  const handlePromptChange = (newPrompt: string) => {
    ttdDebug("prompt atom update", {
      chatId: chatHistory.id,
      fromLength: chatHistory.currentPrompt.length,
      toLength: newPrompt.length,
      sameAsBefore: newPrompt === chatHistory.currentPrompt,
    });
    setChatHistory((prev) => ({
      ...prev,
      currentPrompt: newPrompt,
    }));
  };

  return (
    <div
      className={`ttd-dialog-layout ${
        showPreview
          ? "ttd-dialog-layout--split"
          : "ttd-dialog-layout--chat-only"
      }`}
    >
      <TTDChatPanel
        chatId={chatHistory.id}
        messages={chatHistory.messages}
        currentPrompt={chatHistory.currentPrompt}
        onPromptChange={handlePromptChange}
        onGenerate={onGenerate}
        isGenerating={lastAssistantMessage?.isGenerating ?? false}
        generatedResponse={lastAssistantMessage?.content}
        isMenuOpen={isMenuOpen}
        onMenuToggle={handleMenuToggle}
        onMenuClose={handleMenuClose}
        onNewChat={handleNewChat}
        onRestoreChat={onRestoreChat}
        onDeleteChat={handleDeleteChat}
        savedChats={savedChats}
        activeSessionId={chatHistory.id}
        onAbort={handleAbort}
        onMermaidTabClick={handleMermaidTabClick}
        onAiRepairClick={handleAiRepairClick}
        onDeleteMessage={handleDeleteMessage}
        onInsertMessage={handleInsertMessage}
        onRetry={handleRetry}
        onUserMessageClick={handleUserMessageClick}
        resendFromMessageId={chatHistory.resendFromMessageId}
        onViewAsMermaid={onViewAsMermaid}
        renderWarning={renderWarning}
        renderWelcomeScreen={renderWelcomeScreen}
      />
      {showPreview && (
        <TTDPreviewPanel
          canvasRef={canvasRef}
          hideErrorDetails={lastAssistantMessage?.errorType === "parse"}
          error={error}
          loaded={mermaidToExcalidrawLib.loaded}
          onInsert={handleInsertToEditor}
        />
      )}
    </div>
  );
};

export const TextToDiagram = ({
  mermaidToExcalidrawLib,
  onTextSubmit,
  renderWelcomeScreen,
  renderWarning,
  persistenceAdapter,
}: {
  mermaidToExcalidrawLib: MermaidToExcalidrawLibProps;
  onTextSubmit(
    props: TTTDDialog.OnTextSubmitProps,
  ): Promise<TTTDDialog.OnTextSubmitRetValue>;
  renderWelcomeScreen?: TTTDDialog.renderWelcomeScreen;
  renderWarning?: TTTDDialog.renderWarning;
  persistenceAdapter: TTDPersistenceAdapter;
}) => {
  return (
    <TextToDiagramContent
      mermaidToExcalidrawLib={mermaidToExcalidrawLib}
      onTextSubmit={onTextSubmit}
      renderWelcomeScreen={renderWelcomeScreen}
      renderWarning={renderWarning}
      persistenceAdapter={persistenceAdapter}
    />
  );
};

export default TextToDiagram;
