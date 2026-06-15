import { useCallback } from "react";

import { resolveAutoSaveArchiveLabel } from "../../data/autoSaveSession";
import { hashDocumentSnapshot } from "../../data/sceneHash";
import { ServerSync } from "../../data/ServerSync";

import type { ManagedDocument } from "../../data/documentTypes";
import type { MindMapDocumentData } from "../../data/formats/MindMapAdapter";

export function toMindMapLocalCacheRecord(
  document: ManagedDocument<MindMapDocumentData>,
) {
  return {
    document,
    elements: undefined,
    appState: undefined,
    files: {},
    deltas: [],
  };
}

export function useMindMapFileSave(
  fileId: string | null,
  baseline: string | null,
) {
  return useCallback(
    async (
      document: ManagedDocument<MindMapDocumentData>,
      source: "manual" | "auto" | "visibility" = "manual",
      name?: string,
      thumbnail?: string | null,
    ) => {
      if (!fileId) {
        return null;
      }
      const hash = hashDocumentSnapshot(document);
      const contentChanged = !baseline || hash !== baseline;
      return ServerSync.saveFileImmediate(
        fileId,
        document,
        name,
        thumbnail ?? (contentChanged ? null : undefined),
        {
          archiveLabel: resolveAutoSaveArchiveLabel(source),
        },
      );
    },
    [baseline, fileId],
  );
}
