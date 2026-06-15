import { isLegacyExcalidrawScene, isManagedDocument } from "../documentTypes";
import { parseImportFileJsonMaybe } from "../importFileReadCache";

import { MindMapAdapter } from "./MindMapAdapter";

export type DetectedDocumentFormat =
  | { kind: "excalidraw"; reason: string }
  | { kind: "mindmap"; reason: string }
  | { kind: "unknown"; reason: string };

export async function detectFormat(file: File): Promise<DetectedDocumentFormat> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".smm")) {
    return { kind: "mindmap", reason: "extension" };
  }
  if (name.endsWith(".excalidraw")) {
    return { kind: "excalidraw", reason: "extension" };
  }

  const parsed = await parseImportFileJsonMaybe(file);
  if (parsed === undefined) {
    return { kind: "unknown", reason: "unreadable" };
  }

  if (isManagedDocument(parsed)) {
    if (parsed.kind === "mindmap" && MindMapAdapter.validate(parsed.data)) {
      return { kind: "mindmap", reason: "managed-document" };
    }
    if (parsed.kind === "excalidraw" && isLegacyExcalidrawScene(parsed.data)) {
      return { kind: "excalidraw", reason: "managed-document" };
    }
  }

  if (MindMapAdapter.validate(parsed)) {
    return { kind: "mindmap", reason: "content" };
  }
  if (isLegacyExcalidrawScene(parsed)) {
    return { kind: "excalidraw", reason: "content" };
  }
  return { kind: "unknown", reason: "content" };
}
