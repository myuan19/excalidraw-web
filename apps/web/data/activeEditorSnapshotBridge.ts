import { traceUserAction, traceUserError } from "../lib/userTrace";

import { resolveForegroundEditorFileId } from "./editorTabForeground";

export type ActiveEditorSnapshotSource = "tab-switch" | "tab-close";

export type ActiveEditorSnapshotResult = {
  ok: boolean;
  reason?: string;
};

type ActiveEditorSnapshotHandler = (
  source: ActiveEditorSnapshotSource,
) => Promise<ActiveEditorSnapshotResult>;

const snapshotHandlersByFileId = new Map<string, ActiveEditorSnapshotHandler>();

export function registerEditorTabSnapshotHandler(
  fileId: string,
  handler: ActiveEditorSnapshotHandler,
): () => void {
  snapshotHandlersByFileId.set(fileId, handler);
  traceUserAction(
    "snapshot",
    "registerEditorTabSnapshotHandler",
    { fileId8: fileId.slice(0, 8) },
    "ok",
  );
  return () => {
    if (snapshotHandlersByFileId.get(fileId) === handler) {
      snapshotHandlersByFileId.delete(fileId);
      traceUserAction(
        "snapshot",
        "unregisterEditorTabSnapshotHandler",
        { fileId8: fileId.slice(0, 8) },
        "ok",
      );
    }
  };
}

export async function requestEditorTabSnapshot(
  fileId: string,
  source: ActiveEditorSnapshotSource,
): Promise<ActiveEditorSnapshotResult> {
  const handler = snapshotHandlersByFileId.get(fileId);
  if (!handler) {
    traceUserAction(
      "snapshot",
      "requestEditorTabSnapshot",
      { fileId8: fileId.slice(0, 8), source },
      "skip",
    );
    return { ok: true, reason: "no-handler" };
  }

  traceUserAction(
    "snapshot",
    "requestEditorTabSnapshot",
    { fileId8: fileId.slice(0, 8), source },
    "start",
  );
  try {
    const result = await handler(source);
    traceUserAction(
      "snapshot",
      "requestEditorTabSnapshot",
      {
        fileId8: fileId.slice(0, 8),
        source,
        ok: result.ok,
        reason: result.reason ?? null,
      },
      result.ok ? "ok" : "fail",
    );
    return result;
  } catch (error) {
    traceUserError("snapshot", "requestEditorTabSnapshot", error, {
      fileId8: fileId.slice(0, 8),
      source,
    });
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/** @deprecated 使用 registerEditorTabSnapshotHandler(fileId, …) */
export function registerActiveEditorSnapshotHandler(
  handler: ActiveEditorSnapshotHandler,
): () => void {
  const fileId = resolveForegroundEditorFileId();
  if (!fileId) {
    return () => {};
  }
  return registerEditorTabSnapshotHandler(fileId, handler);
}

export async function requestActiveEditorSnapshot(
  source: ActiveEditorSnapshotSource,
): Promise<ActiveEditorSnapshotResult> {
  const fileId = resolveForegroundEditorFileId();
  if (!fileId) {
    traceUserAction("snapshot", "requestActiveEditorSnapshot", { source }, "skip");
    return { ok: true, reason: "no-active-editor" };
  }
  return requestEditorTabSnapshot(fileId, source);
}

export function resetActiveEditorSnapshotHandlerForTests(): void {
  snapshotHandlersByFileId.clear();
}
