import { useCallback } from "react";

import { resolveAutoSaveArchiveLabel } from "../../data/autoSaveSession";
import { ServerSync } from "../../data/ServerSync";

export function useForkFileSave(fileId: string | null) {
  return useCallback(
    async (
      data: unknown,
      source: "manual" | "visibility" | "interval" = "manual",
      name?: string,
      thumbnail?: string | null,
    ) => {
      if (!fileId) {
        return null;
      }
      return ServerSync.saveFileImmediate(fileId, data, name, thumbnail, {
        archiveLabel: resolveAutoSaveArchiveLabel(source),
      });
    },
    [fileId],
  );
}
