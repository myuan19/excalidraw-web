import { MindMapAdapter } from "../../data/formats/MindMapAdapter";
import { generateMindMapThumbnailAndCache } from "../../data/mindMapThumbnail";
import { saveMindMapBrowserViewFromData } from "../../data/mindMapBrowserViewStorage";
import { ServerSync } from "../../data/ServerSync";

import type { MindMapDocumentData } from "../../data/formats/MindMapAdapter";
import type {
  EditorCreateFileContext,
  EditorImportFileContext,
} from "../types";

export async function createMindMapFile({
  name,
  folderId,
}: EditorCreateFileContext): Promise<{ id: string }> {
  const created = await ServerSync.createFile(name, folderId, "mindmap");
  const mindMapData = MindMapAdapter.createEmpty();
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
  let rawMindMapData: unknown;
  try {
    rawMindMapData = JSON.parse(await file.text());
  } catch {
    throw new Error("Invalid MindMap JSON");
  }
  const data = await MindMapAdapter.parse(rawMindMapData);
  const created = await ServerSync.createFile(fileName, folderId, "mindmap");
  saveMindMapBrowserViewFromData(created.id, rawMindMapData);
  const document = MindMapAdapter.toDocument(data);
  let thumbnail: string | undefined;
  if (MindMapAdapter.validate(data)) {
    thumbnail = await generateMindMapThumbnailAndCache(
      created.id,
      data as MindMapDocumentData,
    );
  }
  await ServerSync.saveFileImmediate(
    created.id,
    document,
    fileName,
    thumbnail,
  );
  return { id: created.id };
}
