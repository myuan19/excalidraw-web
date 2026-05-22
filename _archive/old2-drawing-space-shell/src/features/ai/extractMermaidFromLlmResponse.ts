/**
 * LLM 常返回带 Markdown 围栏的 Mermaid，而 mermaid-to-excalidraw 只接受纯图表定义。
 */
export function extractMermaidDefinition(raw: string): string {
  const text = raw.replace(/\u200b/g, "").trim();
  if (!text) return text;

  const closed = text.match(/```(?:mermaid)?\s*\r?\n([\s\S]*?)```/);
  if (closed) return closed[1].trim();

  const open = text.match(/```(?:mermaid)?\s*\r?\n([\s\S]*)$/);
  if (open) return open[1].trim();

  return text;
}
