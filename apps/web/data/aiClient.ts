import { RequestError } from "@excalidraw/excalidraw/errors";

import { apiTransport } from "./apiTransport";

import type {
  LLMMessage,
  TTTDDialog,
} from "@excalidraw/excalidraw/components/TTDDialog/types";

export type AIProxyFeature =
  | "text-to-diagram"
  | "diagram-to-code"
  | "icon-tag"
  | "mindmap-chat";

async function readJsonErrorFromBody(
  status: number,
  bodyText: string,
): Promise<string> {
  const text = bodyText;
  if (!text) {
    return `HTTP ${status}`;
  }
  try {
    const parsed = JSON.parse(text);
    return parsed.message || parsed.error || text;
  } catch {
    return text;
  }
}

export async function streamAIChat(opts: {
  feature: AIProxyFeature;
  messages: readonly LLMMessage[];
  onChunk?: (chunk: string) => void;
  onStreamCreated?: () => void;
  signal?: AbortSignal;
  systemPrompt?: string;
  temperature?: number;
}): Promise<TTTDDialog.OnTextSubmitRetValue> {
  // Desktop: fetch 走 editorhub:// 协议代理到内部 loopback，保留流式 body。
  const response = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      feature: opts.feature,
      messages: opts.messages,
      systemPrompt: opts.systemPrompt,
      temperature: opts.temperature,
      stream: true,
    }),
    signal: opts.signal,
  });

  if (!response.ok) {
    return {
      error: new RequestError({
        message: await readJsonErrorFromBody(
          response.status,
          await response.text(),
        ),
        status: response.status,
      }),
    };
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return {
      error: new RequestError({
        message: "无法读取响应流",
        status: 500,
      }),
    };
  }

  opts.onStreamCreated?.();

  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) {
          continue;
        }
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") {
          break;
        }
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta;
          const piece =
            (typeof delta?.content === "string" ? delta.content : "") ||
            (typeof json.choices?.[0]?.message?.content === "string"
              ? json.choices[0].message.content
              : "") ||
            "";
          if (piece) {
            full += piece;
            opts.onChunk?.(piece);
          }
        } catch {
          // ignore partial or provider-specific SSE lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!full.trim()) {
    return {
      error: new RequestError({
        message: "模型未返回有效内容",
        status: 500,
      }),
    };
  }

  return { generatedResponse: full, error: null };
}

export async function requestAIVision(opts: {
  feature: "diagram-to-code" | "icon-tag";
  imageDataUrl: string;
  textContext?: string;
  signal?: AbortSignal;
}): Promise<{ content: string }> {
  const response = await apiTransport.request({
    method: "POST",
    path: "/api/ai/vision",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      feature: opts.feature,
      imageDataUrl: opts.imageDataUrl,
      textContext: opts.textContext,
    }),
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      await readJsonErrorFromBody(response.status, response.bodyText),
    );
  }
  const json = JSON.parse(response.bodyText);
  const content = json.choices?.[0]?.message?.content?.trim() || "";
  if (!content) {
    throw new Error("Invalid response from model");
  }
  return { content };
}
