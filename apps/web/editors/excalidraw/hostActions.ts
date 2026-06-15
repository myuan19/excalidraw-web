import { ExcalidrawAdapter } from "../../data/formats/ExcalidrawAdapter";
import { ServerSync } from "../../data/ServerSync";

import type {
  EditorCreateFileContext,
  EditorImportFileContext,
} from "../types";

export async function createExcalidrawFile({
  name,
  folderId,
}: EditorCreateFileContext): Promise<{ id: string }> {
  const created = await ServerSync.createFile(name, folderId, "excalidraw");
  await ServerSync.saveFileImmediate(
    created.id,
    ExcalidrawAdapter.createEmpty(name),
    name,
    undefined,
    { suppressSavedEvent: true },
  );
  return { id: created.id };
}

export async function importExcalidrawFile({
  file,
  fileName,
  folderId,
}: EditorImportFileContext): Promise<{ id: string }> {
  const raw = JSON.parse(await file.text());
  const data = ExcalidrawAdapter.parse(raw);
  const name = fileName.replace(/\.(excalidraw|json)$/i, "") || "Untitled";
  const created = await ServerSync.createFile(name, folderId, "excalidraw");
  await ServerSync.saveFileImmediate(created.id, data, name, undefined, {
    suppressSavedEvent: true,
  });
  return { id: created.id };
}
