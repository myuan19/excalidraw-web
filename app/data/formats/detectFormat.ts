import {
  isManagedDocument,
  isLegacyExcalidrawScene,
} from "../documentTypes";
import {
  parseImportFileJsonMaybe,
  readImportFileText,
} from "../importFileReadCache";
import { editorRegistry } from "../../editors/registry";
import { MindMapAdapter } from "./MindMapAdapter";
import { TextAdapter } from "./TextAdapter";

import type { DocumentKind } from "../documentTypes";

export type DetectedDocumentFormat =
  | {
      kind: "excalidraw";
      confidence: "high" | "medium";
      parsed?: unknown;
    }
  | {
      kind: "mindmap";
      confidence: "high" | "medium";
      parsed?: unknown;
    }
  | {
      kind: "unknown";
      confidence: "low";
      parsed?: unknown;
    }
  | {
      kind: "text";
      confidence: "medium";
      parsed?: unknown;
    };

export function detectFormatFromData(
  data: unknown,
  filename = "",
  mimeType = "",
): DetectedDocumentFormat {
  const name = filename.toLowerCase();
  const mime = mimeType.toLowerCase();

  if (isManagedDocument(data)) {
    if (data.kind === "mindmap" && MindMapAdapter.validate(data.data)) {
      return { kind: "mindmap", confidence: "high", parsed: data };
    }
    if (data.kind === "excalidraw") {
      return { kind: "excalidraw", confidence: "high", parsed: data };
    }
    if (data.kind === "text" && TextAdapter.validate(data.data)) {
      return { kind: "text", confidence: "medium", parsed: data };
    }
    return {
      kind: "unknown",
      confidence: "low",
      parsed: data,
    };
  }

  if (MindMapAdapter.validate(data)) {
    return { kind: "mindmap", confidence: "high", parsed: data };
  }

  if (isLegacyExcalidrawScene(data)) {
    return { kind: "excalidraw", confidence: "high", parsed: data };
  }

  if (name.endsWith(".smm")) {
    return { kind: "mindmap", confidence: "medium", parsed: data };
  }
  if (name.endsWith(".txt") && typeof data === "string") {
    return { kind: "text", confidence: "medium", parsed: data };
  }

  if (
    name.endsWith(".excalidraw") ||
    mime === "application/vnd.excalidraw+json" ||
    mime === "application/x-excalidraw"
  ) {
    return { kind: "excalidraw", confidence: "medium", parsed: data };
  }

  return { kind: "unknown", confidence: "low", parsed: data };
}

export async function detectFormat(file: File): Promise<DetectedDocumentFormat> {
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();

  if (file.type.startsWith("image/")) {
    return { kind: "excalidraw", confidence: "medium" };
  }

  if (name.endsWith(".txt") || mime.startsWith("text/plain")) {
    return { kind: "text", confidence: "medium", parsed: await readImportFileText(file) };
  }

  if (name.endsWith(".svg") || name.endsWith(".png")) {
    return { kind: "excalidraw", confidence: "medium" };
  }

  if (
    name.endsWith(".json") ||
    name.endsWith(".smm") ||
    name.endsWith(".excalidraw") ||
    mime.includes("json")
  ) {
    const parsed = await parseImportFileJsonMaybe(file);
    if (parsed !== undefined) {
      return detectFormatFromData(parsed, file.name, file.type);
    }
  }

  if (name.endsWith(".smm")) {
    return { kind: "mindmap", confidence: "medium" };
  }

  return detectFormatFromData(undefined, file.name, file.type);
}

export function isKnownDocumentKind(kind: string): kind is DocumentKind {
  return (
    editorRegistry.getByKind(kind) != null ||
    kind === "text"
  );
}
