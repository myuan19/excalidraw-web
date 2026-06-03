import { describe, expect, it } from "vitest";

import {
  extractMermaidDefinition,
  isMermaidDefinition,
} from "./extractMermaidFromLlmResponse";

describe("extractMermaidDefinition", () => {
  it("strips ```mermaid fenced blocks", () => {
    const raw = `Here is the diagram:

\`\`\`mermaid
flowchart TD
    A[开始] --> B[结束]
\`\`\``;
    expect(extractMermaidDefinition(raw)).toBe(
      "flowchart TD\n    A[开始] --> B[结束]",
    );
  });

  it("strips generic fenced blocks without mermaid label", () => {
    const raw = `\`\`\`
graph LR
  X --> Y
\`\`\``;
    expect(extractMermaidDefinition(raw)).toBe("graph LR\n  X --> Y");
  });

  it("returns plain diagram text unchanged when there is no fence", () => {
    const raw = "flowchart TD\n  A --> B";
    expect(extractMermaidDefinition(raw)).toBe(raw);
  });

  it("handles unclosed fence (streaming) by taking content after opening", () => {
    const raw = "```mermaid\nflowchart TD\n  A --> B";
    expect(extractMermaidDefinition(raw)).toBe("flowchart TD\n  A --> B");
  });
});

describe("isMermaidDefinition", () => {
  it("accepts supported Mermaid diagram declarations", () => {
    expect(isMermaidDefinition("flowchart TD\n  A --> B")).toBe(true);
    expect(isMermaidDefinition("sequenceDiagram\n  A->>B: Hi")).toBe(true);
  });

  it("rejects plain text responses", () => {
    expect(isMermaidDefinition("I need more detail to create a diagram.")).toBe(
      false,
    );
  });
});
