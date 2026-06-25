import { ExcalidrawAdapter } from "../../data/formats/ExcalidrawAdapter";
import { generateExcalidrawThumbnailAndCache } from "../../data/excalidrawThumbnail";
import { ServerSync } from "../../data/ServerSync";
import { finalizeSavedThumbnail } from "../../data/thumbnailLifecycle";

import type {
  EditorCreateFileContext,
  EditorImportFileContext,
} from "../types";

export async function createExcalidrawFile({
  name,
  folderId,
}: EditorCreateFileContext): Promise<{ id: string }> {
  const created = await ServerSync.createFile(name, folderId, "excalidraw");
  const data = ExcalidrawAdapter.createEmpty(name);
  const thumbnail = await generateExcalidrawThumbnailAndCache(created.id, {
    elements: data.elements ?? [],
    appState: data.appState ?? {},
    files: data.files ?? {},
  });
  const saved = await ServerSync.saveFileImmediate(
    created.id,
    data,
    name,
    thumbnail,
    { suppressSavedEvent: true },
  );
  finalizeSavedThumbnail({
    fileId: created.id,
    kind: "excalidraw",
    name,
    contentSha: saved.content_sha256 ?? null,
    version: saved.version ?? null,
    updatedAt: saved.updated_at ?? null,
    thumbnail,
  });
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
  const thumbnail = await generateExcalidrawThumbnailAndCache(created.id, {
    elements: data.elements ?? [],
    appState: data.appState ?? {},
    files: data.files ?? {},
  });
  const saved = await ServerSync.saveFileImmediate(created.id, data, name, thumbnail, {
    suppressSavedEvent: true,
  });
  if (thumbnail) {
    finalizeSavedThumbnail({
      fileId: created.id,
      kind: "excalidraw",
      name,
      contentSha: saved.content_sha256 ?? null,
      version: saved.version ?? null,
      updatedAt: saved.updated_at ?? null,
      thumbnail,
    });
  }
  return { id: created.id };
}
