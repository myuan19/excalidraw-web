import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { useAtom } from "../../../editor-jotai";

import { chatHistoryAtom, errorAtom, showPreviewAtom } from "../TTDContext";
import {
  convertMermaidToExcalidraw,
  extractMermaidDefinition,
  isMermaidDefinition,
  resetPreview,
} from "../common";
import { isValidMermaidSyntax } from "../utils/mermaidValidation";
import { getLastAssistantMessage } from "../utils/chat";

import { useUIAppState } from "../../../context/ui-appState";

import type { BinaryFiles } from "../../../types";
import type { MermaidToExcalidrawLibProps } from "../types";
import type { TChat } from "../types";

import { ttdDebug } from "../utils/ttdDebug";

const FAST_THROTTLE_DELAY = 300;
const SLOW_THROTTLE_DELAY = 3000;
const RENDER_SPEED_THRESHOLD = 100;
const PARSE_FAIL_DELAY = 100;

interface UseMermaidRendererProps {
  mermaidToExcalidrawLib: MermaidToExcalidrawLibProps;
  canvasRef: React.RefObject<HTMLDivElement | null>;
}

const getMermaidDefinitionFromMessage = (
  message: TChat.ChatMessage | undefined,
): string | null => {
  if (!message?.content || message.error) {
    return null;
  }

  const mermaidDefinition = extractMermaidDefinition(message.content).trim();

  if (!isMermaidDefinition(mermaidDefinition)) {
    return null;
  }

  return mermaidDefinition;
};

const getLastMessageWithMermaid = (
  messages: TChat.ChatMessage[],
): { message: TChat.ChatMessage; mermaidDefinition: string } | null => {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.type !== "assistant") {
      continue;
    }

    const mermaidDefinition = getMermaidDefinitionFromMessage(message);
    if (mermaidDefinition) {
      return { message, mermaidDefinition };
    }
  }

  return null;
};

type PreviewTarget =
  | {
      type: "stream";
      message: TChat.ChatMessage;
      mermaidDefinition: string;
    }
  | {
      type: "fallback";
      message: TChat.ChatMessage;
      mermaidDefinition: string;
      isDuringGeneration: boolean;
      generationMessageId?: string;
    }
  | {
      type: "empty";
    };

/**
 * Unified preview rules:
 * - Switch/open chat: show last diagram in history, or close panel if none.
 * - Send/resend: keep last diagram until new mermaid appears in the generating reply, then clear and stream-draw.
 * - Switch away during generation: background chat stops rendering; active chat still follows the rules above.
 */
const resolvePreviewTarget = ({
  currentAssistantMessage,
  currentAssistantMermaidDefinition,
  lastMessageWithMermaid,
}: {
  currentAssistantMessage: TChat.ChatMessage | undefined;
  currentAssistantMermaidDefinition: string | null;
  lastMessageWithMermaid: ReturnType<typeof getLastMessageWithMermaid>;
}): PreviewTarget => {
  if (
    currentAssistantMessage?.isGenerating &&
    currentAssistantMermaidDefinition
  ) {
    return {
      type: "stream",
      message: currentAssistantMessage,
      mermaidDefinition: currentAssistantMermaidDefinition,
    };
  }

  if (lastMessageWithMermaid) {
    const isDuringGeneration = !!currentAssistantMessage?.isGenerating;

    return {
      type: "fallback",
      message: lastMessageWithMermaid.message,
      mermaidDefinition: lastMessageWithMermaid.mermaidDefinition,
      isDuringGeneration,
      generationMessageId: isDuringGeneration
        ? currentAssistantMessage?.id
        : undefined,
    };
  }

  return { type: "empty" };
};

const getFallbackPreviewKey = (
  chatId: string,
  target: Extract<PreviewTarget, { type: "fallback" }>,
): string => {
  if (target.isDuringGeneration && target.generationMessageId) {
    return `${chatId}:generating:${target.generationMessageId}:${target.message.id}`;
  }

  return `${chatId}:static:${target.message.id}`;
};

export const useMermaidRenderer = ({
  mermaidToExcalidrawLib,
  canvasRef,
}: UseMermaidRendererProps) => {
  const [chatHistory] = useAtom(chatHistoryAtom);
  const [, setError] = useAtom(errorAtom);
  const [showPreview, setShowPreview] = useAtom(showPreviewAtom);
  const isRenderingRef = useRef(false);

  const currentAssistantMessage = useMemo(
    () => getLastAssistantMessage(chatHistory),
    [chatHistory],
  );
  const lastMessageWithMermaid = useMemo(
    () => getLastMessageWithMermaid(chatHistory.messages),
    [chatHistory.messages],
  );
  const currentAssistantMermaidDefinition = useMemo(
    () => getMermaidDefinitionFromMessage(currentAssistantMessage),
    [currentAssistantMessage],
  );
  const previewTarget = useMemo(
    () =>
      resolvePreviewTarget({
        currentAssistantMessage,
        currentAssistantMermaidDefinition,
        lastMessageWithMermaid,
      }),
    [
      currentAssistantMessage,
      currentAssistantMermaidDefinition,
      lastMessageWithMermaid,
    ],
  );

  const data = useRef<{
    elements: readonly NonDeletedExcalidrawElement[];
    files: BinaryFiles | null;
  }>({
    elements: [],
    files: null,
  });

  const lastRenderTimeRef = useRef(0);
  const pendingContentRef = useRef<string | null>(null);
  const hasErrorOffsetRef = useRef(false);
  const currentThrottleDelayRef = useRef(FAST_THROTTLE_DELAY);
  const clearedGeneratingMessageIdRef = useRef<string | null>(null);
  const renderedPreviewKeyRef = useRef<string | null>(null);

  const { theme } = useUIAppState();

  const renderMermaid = useCallback(
    async (mermaidDefinition: string): Promise<boolean> => {
      if (!mermaidDefinition.trim() || !mermaidToExcalidrawLib.loaded) {
        return false;
      }

      if (isRenderingRef.current) {
        return false;
      }

      isRenderingRef.current = true;

      const renderStartTime = performance.now();

      const result = await convertMermaidToExcalidraw({
        canvasRef,
        data,
        mermaidToExcalidrawLib,
        setError,
        mermaidDefinition,
        theme,
      });

      const renderDuration = performance.now() - renderStartTime;

      if (renderDuration < RENDER_SPEED_THRESHOLD) {
        currentThrottleDelayRef.current = FAST_THROTTLE_DELAY;
      } else {
        currentThrottleDelayRef.current = SLOW_THROTTLE_DELAY;
      }

      isRenderingRef.current = false;
      return result.success;
    },
    [canvasRef, mermaidToExcalidrawLib, setError, theme],
  );

  const throttledRenderMermaid = useMemo(() => {
    const fn = async (content: string) => {
      const mermaidDefinition = content.trim();
      if (!mermaidDefinition) {
        return;
      }

      const now = Date.now();
      const timeSinceLastRender = now - lastRenderTimeRef.current;
      const throttleDelay = currentThrottleDelayRef.current;

      if (!isValidMermaidSyntax(mermaidDefinition)) {
        if (!hasErrorOffsetRef.current) {
          lastRenderTimeRef.current = Math.max(
            lastRenderTimeRef.current,
            now - throttleDelay + PARSE_FAIL_DELAY,
          );
          hasErrorOffsetRef.current = true;
        }
        pendingContentRef.current = mermaidDefinition;
        return;
      }

      hasErrorOffsetRef.current = false;

      if (timeSinceLastRender < throttleDelay) {
        pendingContentRef.current = mermaidDefinition;
        return;
      }

      pendingContentRef.current = null;
      const success = await renderMermaid(mermaidDefinition);
      lastRenderTimeRef.current = Date.now();

      if (!success) {
        lastRenderTimeRef.current =
          lastRenderTimeRef.current - throttleDelay + PARSE_FAIL_DELAY;
        hasErrorOffsetRef.current = true;
      }
    };

    fn.flush = async () => {
      if (pendingContentRef.current) {
        const content = pendingContentRef.current;
        pendingContentRef.current = null;
        await renderMermaid(content);
        lastRenderTimeRef.current = Date.now();
      }
    };

    fn.cancel = () => {
      pendingContentRef.current = null;
    };

    return fn;
  }, [renderMermaid]);

  const resetThrottleState = useCallback(() => {
    lastRenderTimeRef.current = 0;
    pendingContentRef.current = null;
    hasErrorOffsetRef.current = false;
    currentThrottleDelayRef.current = FAST_THROTTLE_DELAY;
  }, []);

  const clearCurrentPreview = useCallback(() => {
    data.current = {
      elements: [],
      files: null,
    };
    throttledRenderMermaid.cancel();
    resetThrottleState();
    resetPreview({ canvasRef, setError });
  }, [canvasRef, resetThrottleState, setError, throttledRenderMermaid]);

  const resetPreviewStateForChat = useCallback(() => {
    clearedGeneratingMessageIdRef.current = null;
    renderedPreviewKeyRef.current = null;
    throttledRenderMermaid.cancel();
    resetThrottleState();
  }, [resetThrottleState, throttledRenderMermaid]);

  useEffect(() => {
    ttdDebug("preview chat reset", { chatId: chatHistory.id });
    resetPreviewStateForChat();
  }, [chatHistory.id, resetPreviewStateForChat]);

  // Open/close panel before paint so the canvas exists when the render effect runs.
  useLayoutEffect(() => {
    ttdDebug("preview target", {
      chatId: chatHistory.id,
      type: previewTarget.type,
      showPreview,
      isGenerating: !!currentAssistantMessage?.isGenerating,
      hasLastMermaid: !!lastMessageWithMermaid,
    });

    if (previewTarget.type === "empty") {
      ttdDebug("preview panel close", { chatId: chatHistory.id });
      const canvasNode = canvasRef.current;
      if (canvasNode) {
        const parent = canvasNode.parentElement;
        if (parent) {
          parent.style.background = "";
          canvasNode.replaceChildren();
        }
      }
      setShowPreview(false);
      return;
    }

    setShowPreview(true);
  }, [
    chatHistory.id,
    canvasRef,
    currentAssistantMessage?.isGenerating,
    lastMessageWithMermaid,
    previewTarget,
    setShowPreview,
    showPreview,
  ]);

  useEffect(() => {
    if (!showPreview || previewTarget.type === "empty") {
      return;
    }

    if (!canvasRef.current) {
      ttdDebug("preview render deferred (no canvas)", {
        chatId: chatHistory.id,
        type: previewTarget.type,
      });
      return;
    }

    if (!mermaidToExcalidrawLib.loaded) {
      ttdDebug("preview render deferred (mermaid lib loading)", {
        chatId: chatHistory.id,
        type: previewTarget.type,
      });
      return;
    }

    if (previewTarget.type === "stream") {
      if (clearedGeneratingMessageIdRef.current !== previewTarget.message.id) {
        clearCurrentPreview();
        clearedGeneratingMessageIdRef.current = previewTarget.message.id;
        renderedPreviewKeyRef.current = null;
      }

      throttledRenderMermaid(previewTarget.mermaidDefinition);
      return;
    }

    const fallbackPreviewKey = getFallbackPreviewKey(
      chatHistory.id,
      previewTarget,
    );

    if (renderedPreviewKeyRef.current === fallbackPreviewKey) {
      return;
    }

    if (previewTarget.isDuringGeneration) {
      void (async () => {
        const success = await renderMermaid(previewTarget.mermaidDefinition);
        if (success) {
          renderedPreviewKeyRef.current = fallbackPreviewKey;
          ttdDebug("preview fallback render ok", {
            chatId: chatHistory.id,
            mode: "generating-fallback",
          });
        }
      })();
      return;
    }

    clearedGeneratingMessageIdRef.current = null;
    throttledRenderMermaid.flush();
    resetThrottleState();
    void (async () => {
      const success = await renderMermaid(previewTarget.mermaidDefinition);
      if (success) {
        renderedPreviewKeyRef.current = fallbackPreviewKey;
        ttdDebug("preview fallback render ok", {
          chatId: chatHistory.id,
          mode: "static-fallback",
          messageId: previewTarget.message.id,
        });
      } else {
        ttdDebug("preview fallback render failed", {
          chatId: chatHistory.id,
          messageId: previewTarget.message.id,
        });
      }
    })();
  }, [
    chatHistory.id,
    canvasRef,
    clearCurrentPreview,
    mermaidToExcalidrawLib.loaded,
    previewTarget,
    renderMermaid,
    resetThrottleState,
    showPreview,
    throttledRenderMermaid,
  ]);

  return {
    data,
  };
};
