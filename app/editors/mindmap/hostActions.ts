import {
  createEmptyMindMapData,
  MindMapAdapter,
} from "../../data/formats/MindMapAdapter";
import { parseImportFileJson } from "../../data/importFileReadCache";
import { generateMindMapThumbnailAndCache } from "../../data/mindMapThumbnail";
import { LocalThumbnailCache } from "../../data/localThumbnailCache";
import { ServerSync } from "../../data/ServerSync";

import type {
  EditorCreateFileContext,
  EditorImportFileContext,
  EditorImportFileResult,
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
  await ServerSync.saveFileImmediate(created.id, document, name, thumbnail, {
    source: "create-mindmap",
  });
  return { id: created.id };
}

export async function importMindMapFile({
  file,
  fileName,
  folderId,
}: EditorImportFileContext): Promise<EditorImportFileResult> {
  const rawMindMapData = await parseImportFileJson(file);
  const data = await MindMapAdapter.parse(rawMindMapData);
  const created = await ServerSync.createFile(fileName, folderId, "mindmap");
  const document = MindMapAdapter.toDocument(data);
  const thumbnail = await generateMindMapThumbnailAndCache(created.id, data);
  const saveResult = await ServerSync.saveFileImmediate(
    created.id,
    document,
    fileName,
    thumbnail,
    {
      source: "import-mindmap",
    },
  );
  if (thumbnail && saveResult.content_sha256) {
    LocalThumbnailCache.set(created.id, thumbnail, {
      contentSha: saveResult.content_sha256,
    });
  }
  return {
    id: created.id,
    name: fileName,
    kind: "mindmap",
    folder_id: folderId ?? null,
    content_sha256: saveResult.content_sha256 ?? null,
    has_thumbnail: !!thumbnail,
    created_at: created.created_at,
    updated_at: saveResult.updated_at ?? created.updated_at,
    version: saveResult.version,
  };
}
