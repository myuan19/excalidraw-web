import { FileSyncState } from "../../data/FileSyncState";
import { MindMapAdapter } from "../../data/formats/registry";

import type { MindMapSaveDocument } from "./mindMapDraftState";

function normalizeMindMapSaveDocument(
  document: MindMapSaveDocument,
): MindMapSaveDocument {
  return MindMapAdapter.toDocument(MindMapAdapter.migrate(document, 1));
}

export function toMindMapLocalCacheRecord(
  document: MindMapSaveDocument,
  serverContentSha256?: string,
) {
  return {
    document: normalizeMindMapSaveDocument(document),
    elements: undefined,
    appState: undefined,
    files: {},
    deltas: [],
    ...(serverContentSha256
      ? { meta: { serverContentSha256 } }
      : {}),
  };
}

export function getCachedMindMapServerSha(fileId: string): string | null {
  return FileSyncState.getLocalCache(fileId)?.meta?.serverContentSha256 ?? null;
}
