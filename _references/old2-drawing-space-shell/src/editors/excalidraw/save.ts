import { createPlaceholderThumbnailSvg } from "@/features/thumbnail";

export interface ExcalidrawSceneData {
  type?: string;
  version?: number;
  source?: string;
  elements: readonly unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}

/**
 * JSON-serialized scenes store collaborators as plain objects.
 * Excalidraw expects a Map with forEach — strip invalid values.
 */
export function sanitizeExcalidrawAppState(
  appState: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!appState || typeof appState !== "object") {
    return {};
  }
  const out = { ...appState };
  if ("collaborators" in out && !(out.collaborators instanceof Map)) {
    delete out.collaborators;
  }
  return out;
}

export function normalizeExcalidrawScene(raw: unknown): ExcalidrawSceneData {
  if (!raw || typeof raw !== "object") {
    return { elements: [], appState: {}, files: {} };
  }
  const record = raw as Record<string, unknown>;
  const data = record.kind === "excalidraw" && record.data && typeof record.data === "object"
    ? record.data as Record<string, unknown>
    : record;
  return {
    type: typeof data.type === "string" ? data.type : "excalidraw",
    version: typeof data.version === "number" ? data.version : 2,
    source: typeof data.source === "string" ? data.source : "drawing-space",
    elements: Array.isArray(data.elements) ? data.elements : [],
    appState: sanitizeExcalidrawAppState(
      data.appState && typeof data.appState === "object"
        ? data.appState as Record<string, unknown>
        : {},
    ),
    files: data.files && typeof data.files === "object" ? data.files as Record<string, unknown> : {},
  };
}

export async function blobToText(blob: Blob): Promise<string> {
  return blob.text();
}

export function createExcalidrawFallbackThumbnail(title = "Excalidraw"): string {
  return createPlaceholderThumbnailSvg({ title, kind: "excalidraw" });
}
