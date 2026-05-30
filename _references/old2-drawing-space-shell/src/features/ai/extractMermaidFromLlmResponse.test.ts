import { describe, expect, it } from "vitest";
import { extractMermaidDefinition } from "./extractMermaidFromLlmResponse";

describe("extractMermaidDefinition", () => {
  it("strips mermaid fenced blocks", () => {
    const raw = "```mermaid\nflowchart TD\n  A --> B\n```";
    expect(extractMermaidDefinition(raw)).toBe("flowchart TD\n  A --> B");
  });

  it("returns plain diagram text unchanged", () => {
    const raw = "graph LR\n  X --> Y";
    expect(extractMermaidDefinition(raw)).toBe(raw);
  });
});
