import { sanitizeExcalidrawAppState } from "@/editors/excalidraw/save";

/** IndexedDB only accepts structured-cloneable data — strip functions and Maps. */
export function serializeDeltaPayload(payload: unknown): unknown | null {
  if (payload == null) return null;

  if (
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    ("elements" in payload || "appState" in payload || "files" in payload)
  ) {
    const scene = payload as {
      elements?: unknown;
      appState?: Record<string, unknown>;
      files?: unknown;
    };
    try {
      return JSON.parse(JSON.stringify({
        elements: scene.elements ?? [],
        appState: sanitizeExcalidrawAppState(scene.appState),
        files: scene.files ?? {},
      }));
    } catch {
      return null;
    }
  }

  try {
    return JSON.parse(JSON.stringify(payload));
  } catch {
    return null;
  }
}
