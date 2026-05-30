import { describe, expect, it } from "vitest";
import { chatCompletionsUrl, normalizeBaseUrl } from "./openaiCompatibleStream";

describe("openaiCompatibleStream URL helpers", () => {
  it("normalizes trailing slashes", () => {
    expect(normalizeBaseUrl("https://api.example.test/v1///")).toBe("https://api.example.test/v1");
  });

  it("builds chat completions URL for v1 and non-v1 endpoints", () => {
    expect(chatCompletionsUrl("https://api.example.test/v1")).toBe(
      "https://api.example.test/v1/chat/completions",
    );
    expect(chatCompletionsUrl("https://api.example.test")).toBe(
      "https://api.example.test/v1/chat/completions",
    );
  });
});
