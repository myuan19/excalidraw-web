import { describe, expect, it } from "vitest";
import { toMindMapAIConfigPayload } from "./aiConfigRuntime";
import type { AIConfig } from "@/types/file";

describe("toMindMapAIConfigPayload", () => {
  it("marks MindMap AI as configured when endpoint, key, and model exist", () => {
    const config: AIConfig = {
      excalidraw: {
        endpoint: "",
        apiKey: "",
        textToDiagramModel: "",
        diagramToCodeModel: "",
        iconTagModel: "",
      },
      mindmap: {
        endpoint: "https://api.example.test/v1",
        apiKey: "sk-test",
        model: "gpt-4o",
      },
    };

    expect(toMindMapAIConfigPayload(config)).toMatchObject({
      configured: true,
      api: "https://api.example.test/v1",
      key: "sk-test",
      model: "gpt-4o",
      method: "POST",
    });
  });

  it("falls back to Excalidraw endpoint/key when MindMap endpoint/key are empty", () => {
    const config: AIConfig = {
      excalidraw: {
        endpoint: "https://api.example.test/v1",
        apiKey: "sk-test",
        textToDiagramModel: "gpt-4o-mini",
        diagramToCodeModel: "",
        iconTagModel: "",
      },
      mindmap: {
        endpoint: "",
        apiKey: "",
        model: "",
      },
    };

    expect(toMindMapAIConfigPayload(config)).toMatchObject({
      configured: true,
      api: "https://api.example.test/v1",
      key: "sk-test",
      model: "gpt-4o-mini",
    });
  });
});
