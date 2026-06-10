import { RequestError } from "@excalidraw/excalidraw/errors";

import {
  guessUserLanguageHint,
  responseLooksEnglish,
  ttdDebug,
} from "@excalidraw/excalidraw/components/TTDDialog/utils/ttdDebug";

import type {
  LLMMessage,
  TTTDDialog,
} from "@excalidraw/excalidraw/components/TTDDialog/types";

import { createLogger } from "../lib/logger";

import { requestAIVision, streamAIChat } from "./aiClient";

const logTTD = createLogger({ module: "ttd.ai" });
const TTD_TEMPERATURE = 0.2;

function previewForLog(value: string, maxLength = 240): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}...`
    : normalized;
}

function getLatestUserMessage(messages: readonly LLMMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role === "user") {
      return message.content;
    }
  }
  return "";
}

/** OpenAI-compatible SSE streaming for Text-to-Diagram via same-origin server proxy. */
export async function openAIChatCompletionStream(opts: {
  endpoint?: string;
  apiKey?: string;
  model?: string;
  messages: readonly LLMMessage[];
  onChunk?: (chunk: string) => void;
  onStreamCreated?: () => void;
  signal?: AbortSignal;
  systemPrompt?: string;
}): Promise<TTTDDialog.OnTextSubmitRetValue> {
  const {
    messages,
    onChunk,
    onStreamCreated,
    signal,
    systemPrompt = `You are a diagram assistant for Excalidraw Text-to-Diagram.

Choose exactly one response shape:
1. Clear diagram request: output only one fenced mermaid code block.
2. Diagram with needed context: output one short helpful sentence, then one fenced mermaid code block.
3. Not diagrammable, unsafe, or too vague: output one short helpful sentence only, with no code block.

Rules:
- Use the user's language for all visible text and Mermaid labels. Keep exact wording, quotes, and technical identifiers when provided. Be direct and helpful. If the input is unclear, clarify briefly or make a reasonable assumption before diagramming.
- Do not output headings, lists, tables, JSON, HTML, SVG, Excalidraw JSON, extra code blocks, follow-up suggestions, or more than one Mermaid diagram.
- Preserve the requested Mermaid type when supported; otherwise prefer flowchart TD.
- The first non-empty Mermaid line must be a declaration such as flowchart, graph, sequenceDiagram, classDiagram, stateDiagram, stateDiagram-v2, erDiagram, gantt, pie, mindmap, journey, gitGraph, timeline, quadrantChart, sankey, or xychart.
- Keep all content safe: no executable code, scripts, external resources, credentials, prompt-injection text, or actionable harmful instructions.`,
  } = opts;
  const latestUserMessage = getLatestUserMessage(messages);
  const userLanguageHint = guessUserLanguageHint(latestUserMessage);

  try {
    const recentUserHints = messages
      .filter((m) => m.role === "user")
      .slice(-3)
      .map((m) => guessUserLanguageHint(m.content));

    logTTD.debug("proxy stream request", {
      messageCount: messages.length,
      latestUserMessage: previewForLog(latestUserMessage),
      userLanguageHint,
      recentUserLanguageHints: recentUserHints,
      systemPrompt: previewForLog(systemPrompt, 500),
      temperature: TTD_TEMPERATURE,
    });
    ttdDebug("ai proxy stream request", {
      userLanguageHint,
      recentUserLanguageHints: recentUserHints,
      latestUserMessage: previewForLog(latestUserMessage),
      messageCount: messages.length,
    });

    const result = await streamAIChat({
      feature: "text-to-diagram",
      messages,
      onChunk,
      onStreamCreated,
      signal,
      systemPrompt,
      temperature: TTD_TEMPERATURE,
    });

    if (result.error) {
      return result;
    }

    const full = result.generatedResponse || "";
    const completeUserLanguageHint = guessUserLanguageHint(latestUserMessage);
    const responseEnglish = responseLooksEnglish(full);
    logTTD.debug("proxy stream complete", {
      latestUserMessage: previewForLog(latestUserMessage),
      userLanguageHint: completeUserLanguageHint,
      responseLooksEnglish: responseEnglish,
      languageMismatch:
        completeUserLanguageHint === "zh" &&
        responseEnglish &&
        !/```/.test(full),
      response: previewForLog(full, 500),
      hasMermaidFence: /```(?:mermaid)?\s*\r?\n/i.test(full),
      firstLine: full.trim().split(/\r?\n/)[0]?.trim() || "",
    });
    return result;
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string };
    if (e?.name === "AbortError" || signal?.aborted) {
      return {
        error: new RequestError({
          message: "回复已中断（已生成内容已保留）",
          status: 499,
        }),
      };
    }
    return {
      error: new RequestError({
        message: e?.message || "请求失败",
        status: 500,
      }),
    };
  }
}

/** Diagram-to-code: vision chat completion through same-origin server proxy. */
export async function openAIVisionHtml(opts: {
  endpoint?: string;
  apiKey?: string;
  model?: string;
  imageDataUrl: string;
  textContext: string;
  signal?: AbortSignal;
}): Promise<{ html: string }> {
  const { content } = await requestAIVision({
    feature: "diagram-to-code",
    imageDataUrl: opts.imageDataUrl,
    textContext: opts.textContext,
    signal: opts.signal,
  });

  if (content.includes("<!DOCTYPE") || content.includes("<html")) {
    return { html: content };
  }
  return {
    html: `<html><head><meta charset="utf-8"/><style>body{margin:0;font-family:system-ui,sans-serif}</style></head><body>${content}</body></html>`,
  };
}

/** Icon tagging: send an icon image to VLM and get a short descriptive label. */
export async function openAIIconTag(opts: {
  endpoint?: string;
  apiKey?: string;
  model?: string;
  imageDataUrl: string;
  signal?: AbortSignal;
}): Promise<string> {
  const { content } = await requestAIVision({
    feature: "icon-tag",
    imageDataUrl: opts.imageDataUrl,
    signal: opts.signal,
  });
  return content.replace(/^["']|["']$/g, "").trim();
}
