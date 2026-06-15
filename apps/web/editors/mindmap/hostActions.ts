import {
  createEmptyMindMapData,
  MindMapAdapter,
} from "../../data/formats/MindMapAdapter";
import { ServerSync } from "../../data/ServerSync";

import type {
  EditorCreateFileContext,
  EditorImportFileContext,
} from "../types";

export async function createMindMapFile({
  name,
  folderId,
}: EditorCreateFileContext): Promise<{ id: string }> {
  const created = await ServerSync.createFile(name, folderId, "mindmap");
  await ServerSync.saveFileImmediate(
    created.id,
    MindMapAdapter.toDocument(createEmptyMindMapData(name)),
    name,
  );
  return { id: created.id };
}

export async function importMindMapFile({
  file,
  fileName,
  folderId,
}: EditorImportFileContext): Promise<{ id: string }> {
  const raw = JSON.parse(await file.text());
  const data = MindMapAdapter.parse(raw);
  const name = fileName.replace(/\.(smm|json)$/i, "") || "MindMap";
  const created = await ServerSync.createFile(name, folderId, "mindmap");
  await ServerSync.saveFileImmediate(
    created.id,
    MindMapAdapter.toDocument(data),
    name,
  );
  return { id: created.id };
}
