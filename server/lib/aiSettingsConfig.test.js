import { describe, expect, it } from "vitest";

import {
  isMindMapAIConfigured,
  normalizeConfig,
  resolveMindMapAIEndpoint,
} from "./aiSettingsConfig.js";

describe("aiSettingsConfig", () => {
  it("migrates legacy shared config into MindMap defaults", () => {
    expect(
      normalizeConfig({
        endpoint: "https://api.example.com/v1",
        apiKey: "sk-legacy",
        textToDiagramModel: "diagram-model",
        diagramToCodeModel: "vision-model",
      }),
    ).toMatchObject({
      mindmap: {
        endpoint: "https://api.example.com/v1",
        apiKey: "sk-legacy",
        model: "diagram-model",
      },
    });
  });

  it("resolves OpenAI-compatible MindMap chat completions endpoints", () => {
    expect(resolveMindMapAIEndpoint("https://api.example.com/v1")).toBe(
      "https://api.example.com/v1/chat/completions",
    );
    expect(
      resolveMindMapAIEndpoint("https://api.example.com/v1/chat/completions"),
    ).toBe("https://api.example.com/v1/chat/completions");
  });

  it("requires endpoint and key for MindMap proxy configuration", () => {
    expect(
      isMindMapAIConfigured({
        mindmap: {
          endpoint: "https://api.example.com/v1",
          apiKey: "sk-test",
          model: "",
        },
      }),
    ).toBe(true);
    expect(
      isMindMapAIConfigured({
        mindmap: {
          endpoint: "https://api.example.com/v1",
          apiKey: "",
          model: "gpt-test",
        },
      }),
    ).toBe(false);
  });
});
