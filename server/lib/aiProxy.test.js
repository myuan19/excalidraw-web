import { describe, expect, it } from "vitest";

import {
  AI_PROXY_FEATURE,
  buildAIProxyChatRequest,
  buildAIProxyVisionRequest,
  resolveChatCompletionsUrl,
} from "./aiProxy.js";

const config = {
  excalidraw: {
    endpoint: "https://api.example.com/v1",
    apiKey: "sk-excalidraw",
    textToDiagramModel: "text-model",
    diagramToCodeModel: "vision-model",
    iconTagModel: "icon-model",
  },
  mindmap: {
    endpoint: "https://mindmap.example.com/v1",
    apiKey: "sk-mindmap",
    model: "mindmap-model",
  },
};

describe("aiProxy", () => {
  it("normalizes OpenAI-compatible chat completion URLs consistently", () => {
    expect(resolveChatCompletionsUrl("https://api.example.com")).toBe(
      "https://api.example.com/v1/chat/completions",
    );
    expect(resolveChatCompletionsUrl("https://api.example.com/v1")).toBe(
      "https://api.example.com/v1/chat/completions",
    );
    expect(
      resolveChatCompletionsUrl("https://api.example.com/v1/chat/completions"),
    ).toBe("https://api.example.com/v1/chat/completions");
  });

  it("builds text-to-diagram requests with Cherry Studio profile headers", () => {
    const request = buildAIProxyChatRequest(config, {
      feature: AI_PROXY_FEATURE.TEXT_TO_DIAGRAM,
      messages: [{ role: "user", content: "画一个流程图" }],
      systemPrompt: "system prompt",
    });
    const body = JSON.parse(request.init.body);

    expect(request.endpoint).toBe(
      "https://api.example.com/v1/chat/completions",
    );
    expect(request.init.headers.Authorization).toBe("Bearer sk-excalidraw");
    expect(request.init.headers["x-title"]).toBe("Cherry Studio");
    expect(request.init.headers["http-referer"]).toBe("https://cherry-ai.com");
    expect(body.model).toBe("text-model");
    expect(body.messages[0]).toEqual({
      role: "system",
      content: "system prompt",
    });
    expect(body.messages[1]).toEqual({
      role: "user",
      content: "画一个流程图",
    });
    expect(body.stream).toBe(true);
  });

  it("accepts API keys pasted with an Authorization Bearer prefix", () => {
    const request = buildAIProxyChatRequest(
      {
        ...config,
        mindmap: {
          ...config.mindmap,
          apiKey: "Bearer sk-from-curl",
        },
      },
      {
        feature: AI_PROXY_FEATURE.MINDMAP_CHAT,
        messages: [{ role: "user", content: "整理当前节点" }],
      },
    );

    expect(request.init.headers.Authorization).toBe("Bearer sk-from-curl");
  });

  it("keeps the existing MindMap endpoint resolution contract", () => {
    const request = buildAIProxyChatRequest(
      {
        ...config,
        mindmap: {
          ...config.mindmap,
          endpoint: "https://mindmap.example.com",
        },
      },
      {
        feature: AI_PROXY_FEATURE.MINDMAP_CHAT,
        messages: [{ role: "user", content: "整理当前节点" }],
      },
    );

    expect(request.endpoint).toBe(
      "https://mindmap.example.com/chat/completions",
    );
  });

  it("builds vision requests from server-side feature config", () => {
    const request = buildAIProxyVisionRequest(config, {
      feature: AI_PROXY_FEATURE.ICON_TAG,
      imageDataUrl: "data:image/png;base64,abc",
    });
    const body = JSON.parse(request.init.body);

    expect(request.init.headers.Authorization).toBe("Bearer sk-excalidraw");
    expect(body.model).toBe("icon-model");
    expect(body.max_tokens).toBe(50);
    expect(JSON.stringify(body)).toContain("data:image/png;base64,abc");
  });
});
