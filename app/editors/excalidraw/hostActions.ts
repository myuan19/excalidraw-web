import { FileSyncState } from "../../data/FileSyncState";
import { createBlankExcalidrawInitialScene } from "../../data/forkFileScene";
import { buildAndCacheFileThumbnail } from "../../data/thumbnailService";
import { loadExcalidrawFileAsServerSceneData } from "../../data/importExcalidrawScene";
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
  const initialScene = createBlankExcalidrawInitialScene(name);
  const thumbnail = await buildAndCacheFileThumbnail(created.id, {
    kind: "excalidraw",
    data: initialScene,
  });
  await ServerSync.saveFileImmediate(created.id, initialScene, name, thumbnail);
  FileSyncState.setLocalCache(created.id, {
    elements: initialScene.elements,
    appState: initialScene.appState,
    files: initialScene.files,
    deltas: [],
  });
  return { id: created.id };
}

export async function importExcalidrawFile({
  file,
  fileName,
  folderId,
}: EditorImportFileContext): Promise<{ id: string }> {
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
  await ServerSync.saveFileImmediate(
    created.id,
    initialScene,
    fileName,
    thumbnail,
  );
  FileSyncState.setLocalCache(created.id, {
    elements,
    appState,
    files: sceneFiles,
    deltas: [],
  });
  return { id: created.id };
}
