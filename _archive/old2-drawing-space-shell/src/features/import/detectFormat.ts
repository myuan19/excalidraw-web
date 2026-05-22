export type DetectedImportFormat =
  | { kind: "excalidraw"; parsed?: unknown }
  | { kind: "mindmap"; parsed?: unknown };

function parseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isMindMapData(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const record = data as Record<string, unknown>;
  if (record.kind === "mindmap") return true;
  if ("root" in record && typeof record.root === "object") return true;
  const inner = record.data as Record<string, unknown> | undefined;
  return !!inner && ("root" in inner || inner.layout === "logicalStructure");
}

function isExcalidrawData(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const record = data as Record<string, unknown>;
  return record.type === "excalidraw" || Array.isArray(record.elements) || record.kind === "excalidraw";
}

export function detectFormatFromData(
  data: unknown,
  filename = "",
  mimeType = "",
): DetectedImportFormat {
  const name = filename.toLowerCase();
  const mime = mimeType.toLowerCase();
  if (isMindMapData(data) || name.endsWith(".smm")) {
    return { kind: "mindmap", parsed: data };
  }
  if (
    isExcalidrawData(data) ||
    name.endsWith(".excalidraw") ||
    name.endsWith(".json") ||
    mime.includes("json")
  ) {
    return { kind: "excalidraw", parsed: data };
  }
  return { kind: "excalidraw", parsed: data };
}

export async function detectFormat(file: File): Promise<DetectedImportFormat> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".png") || name.endsWith(".svg") || file.type.startsWith("image/")) {
    return { kind: "excalidraw" };
  }
  const text = await file.text();
  const parsed = parseJson(text);
  return detectFormatFromData(parsed ?? text, file.name, file.type);
}
