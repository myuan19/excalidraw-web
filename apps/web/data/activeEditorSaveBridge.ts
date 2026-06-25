import { traceMindMapOperation } from "./mindMapOperationTrace";
import { traceUserAction, traceUserError } from "../lib/userTrace";

import { resolveForegroundEditorFileId } from "./editorTabForeground";

export type ActiveEditorSaveSource =
  | "manual"
  | "auto"
  | "visibility"
  | "exit"
  | "thumbnail";

type ActiveEditorSaveHandler = (
  source: ActiveEditorSaveSource,
) => Promise<boolean>;

const saveHandlersByFileId = new Map<string, ActiveEditorSaveHandler>();
type ActiveEditorDiscardHandler = () => Promise<void>;
const discardHandlersByFileId = new Map<string, ActiveEditorDiscardHandler>();

export function registerEditorTabSaveHandler(
  fileId: string,
  handler: ActiveEditorSaveHandler,
): () => void {
  saveHandlersByFileId.set(fileId, handler);
  traceUserAction(
    "save",
    "registerEditorTabSaveHandler",
    { fileId8: fileId.slice(0, 8) },
    "ok",
  );
  return () => {
    if (saveHandlersByFileId.get(fileId) === handler) {
      saveHandlersByFileId.delete(fileId);
      traceUserAction(
        "save",
        "unregisterEditorTabSaveHandler",
        { fileId8: fileId.slice(0, 8) },
        "ok",
      );
    }
  };
}

export function registerEditorTabDiscardHandler(
  fileId: string,
  handler: ActiveEditorDiscardHandler,
): () => void {
  discardHandlersByFileId.set(fileId, handler);
  traceUserAction(
    "save",
    "registerEditorTabDiscardHandler",
    { fileId8: fileId.slice(0, 8) },
    "ok",
  );
  return () => {
    if (discardHandlersByFileId.get(fileId) === handler) {
      discardHandlersByFileId.delete(fileId);
      traceUserAction(
        "save",
        "unregisterEditorTabDiscardHandler",
        { fileId8: fileId.slice(0, 8) },
        "ok",
      );
    }
  };
}

export async function requestEditorTabSave(
  fileId: string,
  source: ActiveEditorSaveSource = "manual",
): Promise<boolean> {
  const handler = saveHandlersByFileId.get(fileId);
  if (!handler) {
    traceMindMapOperation("save.editorTabSave.skipNoHandler", {
      fileId8: fileId.slice(0, 8),
      source,
    });
    traceUserAction(
      "save",
      "requestEditorTabSave",
      { fileId8: fileId.slice(0, 8), source },
      "skip",
    );
    return false;
  }
  traceMindMapOperation("save.editorTabSave.start", {
    fileId8: fileId.slice(0, 8),
    source,
  });
  traceUserAction(
    "save",
    "requestEditorTabSave",
    { fileId8: fileId.slice(0, 8), source },
    "start",
  );
  try {
    const ok = await handler(source);
    traceMindMapOperation("save.editorTabSave.after", {
      fileId8: fileId.slice(0, 8),
      source,
      ok,
    });
    traceUserAction(
      "save",
      "requestEditorTabSave",
      { fileId8: fileId.slice(0, 8), source, ok },
      "ok",
    );
    return ok;
  } catch (error) {
    traceMindMapOperation("save.editorTabSave.fail", {
      fileId8: fileId.slice(0, 8),
      source,
      message: error instanceof Error ? error.message : String(error),
    });
    traceUserError("save", "requestEditorTabSave", error, {
      fileId8: fileId.slice(0, 8),
      source,
    });
    throw error;
  }
}

export async function requestEditorTabDiscard(fileId: string): Promise<void> {
  const handler = discardHandlersByFileId.get(fileId);
  if (!handler) {
    traceUserAction(
      "save",
      "requestEditorTabDiscard",
      { fileId8: fileId.slice(0, 8) },
      "skip",
    );
    return;
  }
  traceUserAction(
    "save",
    "requestEditorTabDiscard",
    { fileId8: fileId.slice(0, 8) },
    "start",
  );
  try {
    await handler();
    traceUserAction(
      "save",
      "requestEditorTabDiscard",
      { fileId8: fileId.slice(0, 8) },
      "ok",
    );
  } catch (error) {
    traceUserError("save", "requestEditorTabDiscard", error, {
      fileId8: fileId.slice(0, 8),
    });
    throw error;
  }
}

/** @deprecated 使用 registerEditorTabSaveHandler(fileId, …) */
export function registerActiveEditorSaveHandler(
  handler: ActiveEditorSaveHandler,
): () => void {
  const fileId = resolveForegroundEditorFileId();
  if (!fileId) {
    return () => {};
  }
  return registerEditorTabSaveHandler(fileId, handler);
}

/** @deprecated 使用 registerEditorTabDiscardHandler(fileId, …) */
export function registerActiveEditorDiscardHandler(
  handler: ActiveEditorDiscardHandler,
): () => void {
  const fileId = resolveForegroundEditorFileId();
  if (!fileId) {
    return () => {};
  }
  return registerEditorTabDiscardHandler(fileId, handler);
}

export async function requestActiveEditorDiscard(): Promise<void> {
  const fileId = resolveForegroundEditorFileId();
  if (!fileId) {
    traceUserAction("save", "requestActiveEditorDiscard", {}, "skip");
    return;
  }
  await requestEditorTabDiscard(fileId);
}

export async function requestActiveEditorSave(
  source: ActiveEditorSaveSource = "manual",
): Promise<boolean> {
  const fileId = resolveForegroundEditorFileId();
  if (!fileId) {
    traceMindMapOperation("save.activeEditorSave.skipNoHandler", { source });
    traceUserAction("save", "requestActiveEditorSave", { source }, "skip");
    return false;
  }
  return requestEditorTabSave(fileId, source);
}

export function resetActiveEditorSaveHandlersForTests(): void {
  saveHandlersByFileId.clear();
  discardHandlersByFileId.clear();
}
