import { isEffectivelyEmptyMindMapData, type MindMapDocumentData } from "./bridge";

export type MindMapSavePayloadMeta = {
  requestId?: string;
  revision?: number;
};

export function parseMindMapSaveMeta(payload: unknown): MindMapSavePayloadMeta {
  if (!payload || typeof payload !== "object") return {};
  const record = payload as { requestId?: unknown; revision?: unknown };
  return {
    requestId: typeof record.requestId === "string" ? record.requestId : undefined,
    revision: typeof record.revision === "number" ? record.revision : undefined,
  };
}

export function shouldIgnoreMindMapSavePayload(opts: {
  payload: MindMapSavePayloadMeta;
  activeRequestId: string | null;
  latestRevision: number;
  previousData: MindMapDocumentData;
  nextData: unknown;
  isCurrentSaveResponse: boolean;
}): boolean {
  if (
    opts.payload.requestId &&
    opts.activeRequestId &&
    opts.payload.requestId !== opts.activeRequestId &&
    !opts.isCurrentSaveResponse
  ) {
    return true;
  }
  if (
    !opts.isCurrentSaveResponse &&
    opts.payload.revision !== undefined &&
    opts.payload.revision < opts.latestRevision
  ) {
    return true;
  }
  if (
    !opts.isCurrentSaveResponse &&
    isEffectivelyEmptyMindMapData(opts.nextData) &&
    !isEffectivelyEmptyMindMapData(opts.previousData)
  ) {
    return true;
  }
  return false;
}

