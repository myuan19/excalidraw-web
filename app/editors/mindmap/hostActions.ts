import {
  createEmptyMindMapData,
  MindMapAdapter,
} from "../../data/formats/MindMapAdapter";
import { parseImportFileJson } from "../../data/importFileReadCache";
import { generateMindMapThumbnailAndCache } from "../../data/mindMapThumbnail";
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
  const mindMapData = createEmptyMindMapData(name);
  const document = MindMapAdapter.toDocument(mindMapData);
  const thumbnail = await generateMindMapThumbnailAndCache(
    created.id,
    mindMapData,
  );
  await ServerSync.saveFileImmediate(created.id, document, name, thumbnail);
  return { id: created.id };
}

export async function importMindMapFile({
  file,
  fileName,
  folderId,
}: EditorImportFileContext): Promise<{ id: string }> {
  const rawMindMapData = await parseImportFileJson(file);
  const data = await MindMapAdapter.parse(rawMindMapData);
  const created = await ServerSync.createFile(fileName, folderId, "mindmap");
  const document = MindMapAdapter.toDocument(data);
  const thumbnail = await generateMindMapThumbnailAndCache(created.id, data);
  await ServerSync.saveFileImmediate(created.id, document, fileName, thumbnail);
  return { id: created.id };
}
