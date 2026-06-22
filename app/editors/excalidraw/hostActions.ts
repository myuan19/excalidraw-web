import { FileSyncState } from "../../data/FileSyncState";
import { createBlankExcalidrawInitialScene } from "../../data/forkFileScene";
import { buildAndCacheFileThumbnail } from "../../data/thumbnailService";
import { loadExcalidrawFileAsServerSceneData } from "../../data/importExcalidrawScene";
import { LocalThumbnailCache } from "../../data/localThumbnailCache";
import { ServerSync } from "../../data/ServerSync";

import type {
  EditorCreateFileContext,
  EditorImportFileContext,
  EditorImportFileResult,
} from "../types";

export async function createExcalidrawFile({
  name,
  folderId,
}: EditorCreateFileContext): Promise<{ id: string }> {
  const created = await ServerSync.createFile(name, folderId, "excalidraw");
  const initialScene = createBlankExcalidrawInitialScene(name);
  const thumbnail = await buildAndCacheFileThumbnail(created.id, {
    kind: "excalidraw",
    data: initialScene,
  });
  const saveResult = await ServerSync.saveFileImmediate(
    created.id,
    initialScene,
    name,
    thumbnail,
    { source: "create-excalidraw" },
  );
  FileSyncState.setServerSyncedLocalCache(created.id, {
    elements: initialScene.elements,
    appState: initialScene.appState,
    files: initialScene.files,
    deltas: [],
    meta: {
      ...(saveResult.content_sha256
        ? { serverContentSha256: saveResult.content_sha256 }
        : {}),
      ...(typeof saveResult.version === "number"
        ? { serverVersion: saveResult.version }
        : {}),
    },
  });
  return { id: created.id };
}

export async function importExcalidrawFile({
  file,
  fileName,
  folderId,
}: EditorImportFileContext): Promise<EditorImportFileResult> {
  const {
    elements,
    appState,
    files: sceneFiles,
  } = await loadExcalidrawFileAsServerSceneData(file);
  const created = await ServerSync.createFile(fileName, folderId, "excalidraw");
  const initialScene = { elements, appState, files: sceneFiles };
  const thumbnail = await buildAndCacheFileThumbnail(created.id, {
    kind: "excalidraw",
    data: initialScene,
  });
  const saveResult = await ServerSync.saveFileImmediate(
    created.id,
    initialScene,
    fileName,
    thumbnail,
    { source: "import-excalidraw" },
  );
  if (thumbnail && saveResult.content_sha256) {
    LocalThumbnailCache.set(created.id, thumbnail, {
      contentSha: saveResult.content_sha256,
    });
  }
  FileSyncState.setServerSyncedLocalCache(created.id, {
    elements,
    appState,
    files: sceneFiles,
    deltas: [],
    meta: {
      ...(saveResult.content_sha256
        ? { serverContentSha256: saveResult.content_sha256 }
        : {}),
      ...(typeof saveResult.version === "number"
        ? { serverVersion: saveResult.version }
        : {}),
    },
  });
  return {
    id: created.id,
    name: fileName,
    kind: "excalidraw",
    folder_id: folderId ?? null,
    content_sha256: saveResult.content_sha256 ?? null,
    has_thumbnail: !!thumbnail,
    created_at: created.created_at,
    updated_at: saveResult.updated_at ?? created.updated_at,
    version: saveResult.version,
  };
}
