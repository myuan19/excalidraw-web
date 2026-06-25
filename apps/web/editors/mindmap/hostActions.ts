import {
  createEmptyMindMapData,
  MindMapAdapter,
} from "../../data/formats/MindMapAdapter";
import { parseImportFileJson } from "../../data/importFileReadCache";
import { generateMindMapThumbnailAndCache } from "../../data/mindMapThumbnail";
import { ServerSync } from "../../data/ServerSync";
import { finalizeSavedThumbnail } from "../../data/thumbnailLifecycle";
import { devDebug } from "../../lib/devDebug";
import { traceUserAction, traceUserError } from "../../lib/userTrace";

import type {
  EditorCreateFileContext,
  EditorImportFileContext,
} from "../types";

export async function createMindMapFile({
  name,
  folderId,
}: EditorCreateFileContext): Promise<{ id: string }> {
  devDebug("api-sync", "createMindMapFile | start", { name, folderId });
  const mindMapData = createEmptyMindMapData(name);
  const document = MindMapAdapter.toDocument(mindMapData);
  const created = await ServerSync.createFile(name, folderId, "mindmap");
  const thumbnail = await generateMindMapThumbnailAndCache(
    created.id,
    mindMapData,
  );
  const saved = await ServerSync.saveFileImmediate(
    created.id,
    document,
    name,
    thumbnail,
  );
  finalizeSavedThumbnail({
    fileId: created.id,
    kind: "mindmap",
    name,
    contentSha: saved.content_sha256 ?? null,
    version: saved.version ?? null,
    updatedAt: saved.updated_at ?? null,
    thumbnail,
  });
  devDebug("api-sync", "createMindMapFile | ok", { id8: created.id.slice(0, 8) });
  return { id: created.id };
}

export async function importMindMapFile({
  file,
  fileName,
  folderId,
}: EditorImportFileContext): Promise<{ id: string }> {
  traceUserAction("file-list", "importMindMapFile", {
    fileName,
    folderId,
  }, "start");
  try {
  const raw = await parseImportFileJson(file);
  const data = MindMapAdapter.parse(raw);
  const name = fileName.replace(/\.(smm|json)$/i, "") || "MindMap";
  const created = await ServerSync.createFile(name, folderId, "mindmap");
  const document = MindMapAdapter.toDocument(data);
  const thumbnail = await generateMindMapThumbnailAndCache(
    created.id,
    data,
  );
  const saved = await ServerSync.saveFileImmediate(
    created.id,
    document,
    name,
    thumbnail,
  );
  if (thumbnail) {
    finalizeSavedThumbnail({
      fileId: created.id,
      kind: "mindmap",
      name,
      contentSha: saved.content_sha256 ?? null,
      version: saved.version ?? null,
      updatedAt: saved.updated_at ?? null,
      thumbnail,
    });
  }
  traceUserAction("file-list", "importMindMapFile", {
    id8: created.id.slice(0, 8),
    hasThumbnail: !!thumbnail,
  }, "ok");
  return { id: created.id };
  } catch (error) {
    traceUserError("file-list", "importMindMapFile", error, { fileName });
    throw error;
  }
}
