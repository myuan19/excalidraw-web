import {
  getServerSyncErrorJson,
  isServerSyncVersionConflictError,
} from "../data/ServerSync";
import { createLogger } from "../lib/logger";

import { promptServerUpdateConfirm } from "./editorLeaveConfirm";

const log = createLogger({ module: "saveConflict" });

export type EditorSaveConflictAction =
  | "force-overwrite"
  | "load-remote"
  | "cancel";

export type EditorSaveConflictResult =
  | {
      handled: false;
    }
  | {
      handled: true;
      action: EditorSaveConflictAction;
      saved: boolean;
    };

function getConflictServerVersion(error: unknown): number | null {
  const body = getServerSyncErrorJson(error) as { version?: unknown } | null;
  return typeof body?.version === "number" ? body.version : null;
}

export async function resolveEditorSaveConflict(
  error: unknown,
  opts: {
    documentName?: string | null;
    loadRemote: () => Promise<void>;
    forceOverwrite: () => Promise<boolean>;
  },
): Promise<EditorSaveConflictResult> {
  if (!isServerSyncVersionConflictError(error)) {
    return { handled: false };
  }

  const serverVersion = getConflictServerVersion(error);
  const choice = await promptServerUpdateConfirm({
    documentName: opts.documentName,
    serverVersion,
    mode: "save-conflict",
  });

  try {
    if (choice === "load-remote") {
      await opts.loadRemote();
      return { handled: true, action: "load-remote", saved: true };
    }
    if (choice === "keep-local") {
      const saved = await opts.forceOverwrite();
      return { handled: true, action: "force-overwrite", saved };
    }
    return { handled: true, action: "cancel", saved: false };
  } catch (resolutionError) {
    log.warn("failed to resolve save conflict", {
      action: choice,
      message:
        resolutionError instanceof Error
          ? resolutionError.message
          : String(resolutionError),
    });
    return { handled: true, action: "cancel", saved: false };
  }
}
