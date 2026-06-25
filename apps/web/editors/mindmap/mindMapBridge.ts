import {
  MindMapAdapter,
  type MindMapDocumentData,
} from "../../data/formats/MindMapAdapter";

export const MINDMAP_NATIVE_SOURCE = "simple-mind-map-native";
export const MINDMAP_HOST_SOURCE = "editorhub-host";

export type MindMapNativeMessage = {
  source?: unknown;
  type?: unknown;
  payload?: unknown;
  requestId?: unknown;
  data?: unknown;
};

export function isMindMapNativeMessage(
  message: unknown,
): message is MindMapNativeMessage {
  if (!message || typeof message !== "object") {
    return false;
  }
  return (message as MindMapNativeMessage).source === MINDMAP_NATIVE_SOURCE;
}

export function buildMindMapHostInitMessage(data: unknown, view?: unknown) {
  const mindMapData = MindMapAdapter.parse(data);
  return {
    source: MINDMAP_HOST_SOURCE,
    type: "init",
    data: mindMapData,
    view: view ?? mindMapData.view ?? null,
  };
}

export function buildMindMapSaveRequestMessage(requestId: string) {
  return {
    source: MINDMAP_HOST_SOURCE,
    type: "requestMindMapSave",
    payload: { requestId },
    requestId,
  };
}

export function buildMindMapSaveStatusMessage(
  requestId: string | null,
  ok: boolean,
  error?: string,
) {
  return {
    source: MINDMAP_HOST_SOURCE,
    type: "mindMapHostSaveStatus",
    payload: {
      requestId,
      ok,
      error: error ?? null,
    },
    requestId,
  };
}

export function parseMindMapThumbnailPayload(payload: unknown): {
  revision?: number;
  thumbnail: string;
} | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.thumbnail !== "string" || !record.thumbnail.trim()) {
    return null;
  }
  return {
    thumbnail: record.thumbnail,
    revision:
      typeof record.revision === "number" ? record.revision : undefined,
  };
}

export function parseMindMapSavePayload(payload: unknown): {
  mindMapData: MindMapDocumentData;
  thumbnail?: string | null;
  requestId?: string | null;
  revision?: number;
  userEdit: boolean;
  reason?: string;
} | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const mindMapData = record.mindMapData ?? record.data;
  if (!mindMapData) {
    return null;
  }
  try {
    return {
      mindMapData: MindMapAdapter.parse(mindMapData),
      thumbnail:
        typeof record.thumbnail === "string" ? record.thumbnail : undefined,
      requestId:
        typeof record.requestId === "string"
          ? record.requestId
          : record.requestId === null
            ? null
            : undefined,
      revision:
        typeof record.revision === "number" ? record.revision : undefined,
      userEdit: record.userEdit === true,
      reason: typeof record.reason === "string" ? record.reason : undefined,
    };
  } catch {
    return null;
  }
}

export function createMindMapBridgeRequestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
