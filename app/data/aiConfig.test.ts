import {
  normalizeAIConfig,
  resolveMindMapAIEndpoint,
} from "./aiConfig";

describe("normalizeAIConfig", () => {
  it("migrates legacy shared AI config into separate Excalidraw and MindMap config", () => {
    expect(
      normalizeAIConfig({
        endpoint: "https://api.example.com/v1",
        apiKey: "sk-legacy",
        textToDiagramModel: "diagram-model",
        diagramToCodeModel: "vision-model",
        iconTagModel: "icon-model",
      }),
    ).toEqual({
      excalidraw: {
        endpoint: "https://api.example.com/v1",
        apiKey: "sk-legacy",
        textToDiagramModel: "diagram-model",
        diagramToCodeModel: "vision-model",
        iconTagModel: "icon-model",
      },
      mindmap: {
        endpoint: "https://api.example.com/v1",
        apiKey: "sk-legacy",
        model: "diagram-model",
      },
    });
  });

  it("preserves explicit separated AI config", () => {
    expect(
      normalizeAIConfig({
        excalidraw: {
          endpoint: "https://excalidraw.example.com/v1",
          apiKey: "sk-excalidraw",
          textToDiagramModel: "text-model",
          diagramToCodeModel: "code-model",
          iconTagModel: "icon-model",
        },
        mindmap: {
          endpoint: "https://mindmap.example.com/v1",
          apiKey: "sk-mindmap",
          model: "mindmap-model",
        },
      }),
    ).toEqual({
      excalidraw: {
        endpoint: "https://excalidraw.example.com/v1",
        apiKey: "sk-excalidraw",
        textToDiagramModel: "text-model",
        diagramToCodeModel: "code-model",
        iconTagModel: "icon-model",
      },
      mindmap: {
        endpoint: "https://mindmap.example.com/v1",
        apiKey: "sk-mindmap",
        model: "mindmap-model",
      },
    });
  });
});

describe("resolveMindMapAIEndpoint", () => {
  it("converts an OpenAI-compatible base URL into the chat completions URL", () => {
    expect(resolveMindMapAIEndpoint("https://api.siliconflow.cn/v1")).toBe(
      "https://api.siliconflow.cn/v1/chat/completions",
    );
  });

  it("does not append chat completions twice", () => {
    expect(
      resolveMindMapAIEndpoint(
        "https://api.siliconflow.cn/v1/chat/completions",
      ),
    ).toBe("https://api.siliconflow.cn/v1/chat/completions");
  });
});
