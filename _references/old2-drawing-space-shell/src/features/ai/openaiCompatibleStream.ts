export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StreamResult {
  generatedResponse?: string;
  error: Error | null;
}

export function normalizeBaseUrl(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, "");
}

export function chatCompletionsUrl(endpoint: string): string {
  const base = normalizeBaseUrl(endpoint);
  return base.endsWith("/v1") ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
}

function thinkingDisabledExtras(): Record<string, unknown> {
  return {
    thinking: { type: "disabled" },
    enable_thinking: false,
    chat_template_kwargs: { enable_thinking: false },
  };
}

export async function openAIChatCompletionStream(opts: {
  endpoint: string;
  apiKey: string;
  model: string;
  messages: readonly LLMMessage[];
  onChunk?: (chunk: string) => void;
  onStreamCreated?: () => void;
  signal?: AbortSignal;
  systemPrompt?: string;
}): Promise<StreamResult> {
  if (!opts.endpoint.trim() || !opts.apiKey.trim()) {
    return { error: new Error("请先配置 Base URL 与 API Key。") };
  }

  try {
    const response = await fetch(chatCompletionsUrl(opts.endpoint), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: opts.model || "gpt-4o",
        messages: [
          {
            role: "system",
            content: opts.systemPrompt ?? "You are a diagram assistant. Respond with valid Mermaid syntax when asked.",
          },
          ...opts.messages,
        ],
        stream: true,
        ...thinkingDisabledExtras(),
      }),
      signal: opts.signal,
    });

    if (!response.ok) {
      return { error: new Error(await response.text() || `HTTP ${response.status}`) };
    }

    const reader = response.body?.getReader();
    if (!reader) return { error: new Error("无法读取响应流") };
    opts.onStreamCreated?.();

    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") break;
        try {
          const json = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: unknown }; message?: { content?: unknown } }>;
          };
          const piece = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content;
          if (typeof piece === "string" && piece) {
            full += piece;
            opts.onChunk?.(piece);
          }
        } catch {
          // ignore partial or non-JSON SSE payloads
        }
      }
    }
    reader.releaseLock();
    return full.trim() ? { generatedResponse: full, error: null } : { error: new Error("模型未返回有效内容") };
  } catch (error) {
    const err = error as { name?: string; message?: string };
    return { error: new Error(err.name === "AbortError" ? "回复已中断" : err.message || "请求失败") };
  }
}

export async function openAIVisionHtml(opts: {
  endpoint: string;
  apiKey: string;
  model: string;
  imageDataUrl: string;
  textContext: string;
  signal?: AbortSignal;
}): Promise<{ html: string }> {
  if (!opts.endpoint.trim() || !opts.apiKey.trim()) {
    throw new Error("请先配置 Base URL 与 API Key。");
  }
  const response = await fetch(chatCompletionsUrl(opts.endpoint), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
    body: JSON.stringify({
      model: opts.model || "gpt-4o",
      messages: [
        { role: "system", content: "Convert UI sketches to a single self-contained HTML snippet. Output only HTML." },
        {
          role: "user",
          content: [
            { type: "text", text: opts.textContext || "Convert this diagram screenshot to HTML/CSS." },
            { type: "image_url", image_url: { url: opts.imageDataUrl } },
          ],
        },
      ],
      max_tokens: 4096,
      ...thinkingDisabledExtras(),
    }),
    signal: opts.signal,
  });
  if (!response.ok) throw new Error(await response.text() || `HTTP ${response.status}`);
  const json = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  const html = json.choices?.[0]?.message?.content;
  if (typeof html !== "string" || !html.trim()) throw new Error("Invalid response from model");
  return html.includes("<html") ? { html } : { html: `<html><body>${html}</body></html>` };
}

export async function openAIIconTag(opts: {
  endpoint: string;
  apiKey: string;
  model: string;
  imageDataUrl: string;
  signal?: AbortSignal;
}): Promise<string> {
  const result = await openAIVisionHtml({
    endpoint: opts.endpoint,
    apiKey: opts.apiKey,
    model: opts.model || "gpt-4o",
    imageDataUrl: opts.imageDataUrl,
    textContext: "这是什么图标？只回复一个简短标签。",
    signal: opts.signal,
  });
  return result.html.replace(/<[^>]*>/g, "").replace(/^["']|["']$/g, "").trim();
}
