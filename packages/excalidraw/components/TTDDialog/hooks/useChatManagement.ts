import { useCallback, useState } from "react";

import { useAtom, useSetAtom } from "../../../editor-jotai";

import { errorAtom, chatHistoryAtom } from "../TTDContext";

import { useTTDChatStorage } from "../useTTDChatStorage";

import { getLastAssistantMessage } from "../utils/chat";

import type { SavedChat, TTDPersistenceAdapter } from "../types";

import { ttdDebug } from "../utils/ttdDebug";

interface UseChatManagementProps {
  persistenceAdapter: TTDPersistenceAdapter;
}

export const useChatManagement = ({
  persistenceAdapter,
}: UseChatManagementProps) => {
  const setError = useSetAtom(errorAtom);
  const [chatHistory, setChatHistory] = useAtom(chatHistoryAtom);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const { savedChats, restoreChat, deleteChat, createNewChatId } =
    useTTDChatStorage({
      persistenceAdapter,
    });

  const applyChatToState = useCallback(
    (chat: SavedChat) => {
      const restoredMessages = chat.messages.map((msg) => ({
        ...msg,
        timestamp:
          msg.timestamp instanceof Date
            ? msg.timestamp
            : new Date(msg.timestamp),
      }));

      const history = {
        id: chat.id,
        messages: restoredMessages,
        currentPrompt: "",
        resendFromMessageId: null,
      };

      const lastAssistantMsg = getLastAssistantMessage(history);

      setError(
        lastAssistantMsg?.error ? new Error(lastAssistantMsg?.error) : null,
      );
      ttdDebug("chat apply to state", {
        chatId: history.id,
        messageCount: history.messages.length,
        isGenerating: !!lastAssistantMsg?.isGenerating,
      });
      setChatHistory(history);
    },
    [setError, setChatHistory],
  );

  const resetChatState = useCallback(async () => {
    const newSessionId = await createNewChatId();
    setChatHistory({
      id: newSessionId,
      messages: [],
      currentPrompt: "",
      resendFromMessageId: null,
    });
    setError(null);
  }, [createNewChatId, setChatHistory, setError]);

  const onRestoreChat = useCallback(
    (chat: SavedChat) => {
      ttdDebug("chat restore click", {
        targetChatId: chat.id,
        activeChatId: chatHistory.id,
        isGenerating: !!getLastAssistantMessage(chatHistory)?.isGenerating,
        savedChatsCount: savedChats.length,
      });
      const latestChat = savedChats.find((saved) => saved.id === chat.id) ?? chat;
      const restoredChat = restoreChat(latestChat);
      applyChatToState(restoredChat);

      setIsMenuOpen(false);
    },
    [savedChats, restoreChat, applyChatToState, chatHistory],
  );

  const handleDeleteChat = useCallback(
    async (chatId: string, event: React.MouseEvent) => {
      event.stopPropagation();

      const isDeletingActiveChat = chatId === chatHistory.id;
      const updatedChats = await deleteChat(chatId);

      if (isDeletingActiveChat) {
        if (updatedChats.length > 0) {
          const nextChat = updatedChats[0];
          applyChatToState(nextChat);
        } else {
          await resetChatState();
        }
      }
    },
    [chatHistory.id, deleteChat, applyChatToState, resetChatState],
  );

  const handleNewChat = useCallback(async () => {
    ttdDebug("chat new click", {
      activeChatId: chatHistory.id,
      isGenerating: !!getLastAssistantMessage(chatHistory)?.isGenerating,
    });
    await resetChatState();
    setIsMenuOpen(false);
  }, [resetChatState, chatHistory]);

  const handleMenuToggle = useCallback(() => {
    const isGenerating = !!getLastAssistantMessage(chatHistory)?.isGenerating;
    ttdDebug("chat menu toggle", {
      activeChatId: chatHistory.id,
      isGenerating,
      menuWillOpen: !isMenuOpen,
    });
    setIsMenuOpen((prev) => !prev);
  }, [chatHistory, isMenuOpen]);

  const handleMenuClose = useCallback(() => {
    setIsMenuOpen(false);
  }, []);

  return {
    isMenuOpen,
    onRestoreChat,
    handleDeleteChat,
    handleNewChat,
    handleMenuToggle,
    handleMenuClose,
  };
};
