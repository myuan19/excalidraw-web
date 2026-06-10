import { describe, expect, it } from "vitest";

import { buildMindMapAIProxyRequest } from "./mindmap-ai.js";

const config = {
  excalidraw: {
    endpoint: "",
    apiKey: "",
    textToDiagramModel: "",
    diagramToCodeModel: "",
    iconTagModel: "",
  },
  mindmap: {
    endpoint: "https://api.example.com/v1",
    apiKey: "sk-server",
    model: "gpt-mindmap",
  },
};

describe("mindmap-ai proxy request", () => {
  it("builds upstream requests from server-side config only", () => {
    const request = buildMindMapAIProxyRequest(config, {
      endpoint: "https://evil.example.com/v1",
      apiKey: "sk-client",
      messages: [{ role: "user", content: "整理当前节点" }],
    });
    const body = JSON.parse(request.init.body);

    expect(request.endpoint).toBe(
      "https://api.example.com/v1/chat/completions",
    );
    expect(request.init.headers.Authorization).toBe("Bearer sk-server");
    expect(body).toMatchObject({
      model: "gpt-mindmap",
      messages: [{ role: "user", content: "整理当前节点" }],
      stream: true,
    });
    expect(request.init.body).not.toContain("evil.example.com");
    expect(request.init.body).not.toContain("sk-client");
  });

  it("rejects empty message payloads", () => {
    try {
      buildMindMapAIProxyRequest(config, { messages: [] });
      throw new Error("expected buildMindMapAIProxyRequest to throw");
    } catch (error) {
      expect(error.message).toBe("messages_required");
      expect(error.status).toBe(400);
    }
  });

  it("defaults the model when settings omit one", () => {
    const request = buildMindMapAIProxyRequest(
      {
        ...config,
        mindmap: {
          ...config.mindmap,
          model: "",
        },
      },
      { messages: [{ role: "user", content: "整理当前节点" }] },
    );

    expect(JSON.parse(request.init.body).model).toBe("gpt-4o");
  });
});
