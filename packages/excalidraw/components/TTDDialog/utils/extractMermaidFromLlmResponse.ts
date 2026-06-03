const MERMAID_DECLARATION_RE =
  /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie|mindmap|journey|gitGraph|timeline|quadrantChart|sankey|xychart)\b/i;

/**
 * LLM 常返回带 Markdown 围栏的 Mermaid（```mermaid ... ```），而
 * @excalidraw/mermaid-to-excalidraw 只接受纯图表定义。从回复中抽出可解析片段。
 */
export function extractMermaidDefinition(raw: string): string {
  const text = raw.replace(/\u200b/g, "").trim();
  if (!text) {
    return text;
  }

  // 闭合围栏：优先匹配 ```mermaid / ``` 代码块
  const closed = text.match(/```(?:mermaid)?\s*\r?\n([\s\S]*?)```/);
  if (closed) {
    return closed[1].trim();
  }

  // 流式或未闭合：从首个 ``` 起直到文末（或下次解析时再试）
  const open = text.match(/```(?:mermaid)?\s*\r?\n([\s\S]*)$/);
  if (open) {
    return open[1].trim();
  }

  return text;
}

export function isMermaidDefinition(content: string): boolean {
  const firstLine = content.trim().split(/\r?\n/)[0]?.trim() || "";
  return MERMAID_DECLARATION_RE.test(firstLine);
}
