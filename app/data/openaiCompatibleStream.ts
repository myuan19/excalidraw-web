import { RequestError } from "@excalidraw/excalidraw/errors";

import type {
  LLMMessage,
  TTTDDialog,
} from "@excalidraw/excalidraw/components/TTDDialog/types";

function normalizeBaseUrl(endpoint: string): string {
  const t = endpoint.trim().replace(/\/+$/, "");
  return t;
}

function chatCompletionsUrl(endpoint: string): string {
  const base = normalizeBaseUrl(endpoint);
  if (base.endsWith("/v1")) {
    return `${base}/chat/completions`;
  }
  return `${base}/v1/chat/completions`;
}

/**
 * 关闭「思考 / 推理链」输出，兼容多类 OpenAI 形态网关（多余字段常被忽略；若遇 400 可换纯 OpenAI 端点）。
 * - DeepSeek: thinking.type = disabled
 * - 通义等: enable_thinking / chat_template_kwargs
 */
function thinkingDisabledExtras(): Record<string, unknown> {
  return {
    thinking: { type: "disabled" },
    enable_thinking: false,
    chat_template_kwargs: { enable_thinking: false },
  };
}

/** OpenAI-compatible SSE streaming for Text-to-Diagram. */
export async function openAIChatCompletionStream(opts: {
  endpoint: string;
  apiKey: string;
  model: string;
  messages: readonly LLMMessage[];
  onChunk?: (chunk: string) => void;
  onStreamCreated?: () => void;
  signal?: AbortSignal;
  systemPrompt?: string;
}): Promise<TTTDDialog.OnTextSubmitRetValue> {
  const {
    endpoint,
    apiKey,
    model,
    messages,
    onChunk,
    onStreamCreated,
    signal,
    systemPrompt = `You are a diagram assistant. Respond with valid Mermaid diagram syntax only when asked to convert text to a diagram. Use a single fenced code block with language mermaid when appropriate.`,
  } = opts;

  if (!endpoint?.trim() || !apiKey?.trim()) {
    return {
      error: new RequestError({
        message: "请先在首页配置 Base URL 与 API Key（AI 设置）。",
        status: 400,
      }),
    };
  }

  const url = chatCompletionsUrl(endpoint);
  const bodyMessages = [
    { role: "system" as const, content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    })),
  ];

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: model || "gpt-4o",
        messages: bodyMessages,
        stream: true,
        ...thinkingDisabledExtras(),
      }),
      signal,
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        error: new RequestError({
          message: text || `HTTP ${response.status}`,
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

    onStreamCreated?.();

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
            // 仅拼接正文，忽略 reasoning/thinking 通道，避免思考内容进入画布
            const piece =
              (typeof delta?.content === "string" ? delta.content : "") ||
              (typeof json.choices?.[0]?.message?.content === "string"
                ? json.choices[0].message.content
                : "") ||
              "";
            if (typeof piece === "string" && piece.length) {
              full += piece;
              onChunk?.(piece);
            }
          } catch {
            // ignore partial JSON
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

/** Diagram-to-code: vision chat completion (non-streaming). */
export async function openAIVisionHtml(opts: {
  endpoint: string;
  apiKey: string;
  model: string;
  imageDataUrl: string;
  textContext: string;
  signal?: AbortSignal;
}): Promise<{ html: string }> {
  const { endpoint, apiKey, model, imageDataUrl, textContext, signal } = opts;

  if (!endpoint?.trim() || !apiKey?.trim()) {
    throw new Error("请先在首页配置 Base URL 与 API Key（AI 设置）。");
  }

  const url = chatCompletionsUrl(endpoint);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You convert UI sketches to a single self-contained HTML snippet with inline CSS. Output only the HTML document body content or a full minimal HTML page. No markdown fences.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                textContext ||
                "Convert this diagram screenshot to clean HTML/CSS.",
            },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      max_tokens: 4096,
      ...thinkingDisabledExtras(),
    }),
    signal,
  });

  if (!response.ok) {
    const t = await response.text();
    throw new Error(t || `HTTP ${response.status}`);
  }

  const json = await response.json();
  const html =
    json.choices?.[0]?.message?.content?.trim() ||
    json.choices?.[0]?.message?.content;
  if (!html || typeof html !== "string") {
    throw new Error("Invalid response from model");
  }

  let out = html;
  if (out.includes("<!DOCTYPE") || out.includes("<html")) {
    return { html: out };
  }
  return {
    html: `<html><head><meta charset="utf-8"/><style>body{margin:0;font-family:system-ui,sans-serif}</style></head><body>${out}</body></html>`,
  };
}

/** Icon tagging: send an icon image to VLM and get a short descriptive label. */
export async function openAIIconTag(opts: {
  endpoint: string;
  apiKey: string;
  model: string;
  imageDataUrl: string;
  signal?: AbortSignal;
}): Promise<string> {
  const { endpoint, apiKey, model, imageDataUrl, signal } = opts;

  if (!endpoint?.trim() || !apiKey?.trim()) {
    throw new Error("请先在首页配置 Base URL 与 API Key（AI 设置）。");
  }

  const url = chatCompletionsUrl(endpoint);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "给定一张图标或图形图片，只输出一个简短的描述性标签（1-4个词）。\n\n规则：\n1. 默认使用中文描述图形的形状或含义，例如：六边形、五角星、圆形箭头、数据库、用户头像、齿轮设置、云服务器\n2. 如果图标是知名的技术品牌/产品Logo（如 React、Docker、Kubernetes、AWS、GitHub 等），则直接使用其英文名称\n3. 不要加标点符号、不要解释、不要输出多余内容，只输出标签本身",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "这是什么图标？只回复一个简短标签。",
            },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      max_tokens: 50,
      ...thinkingDisabledExtras(),
    }),
    signal,
  });

  if (!response.ok) {
    const t = await response.text();
    throw new Error(t || `HTTP ${response.status}`);
  }

  const json = await response.json();
  const tag =
    json.choices?.[0]?.message?.content?.trim() || "";
  return tag.replace(/^["']|["']$/g, "").trim();
}
