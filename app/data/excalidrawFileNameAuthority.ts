import { DEFAULT_DOCUMENT_DISPLAY_NAME } from "./defaultDocumentName";
import { readFileListTreeCache } from "./fileListSessionCache";
import { mergeAppStateWithServerFileName } from "./forkFileScene";
import { isLocalDraftFileId } from "./localDraftFileId";
import { LocalDraftSessions } from "./localDraftSessions";

/**
 * EditorHub document names are business metadata, not arbitrary Excalidraw
 * appState. Keep the authority here so native defaults cannot be promoted by
 * generic scene change/cache/save paths.
 */
export function resolveCanonicalExcalidrawFileName(
  fileId: string | null,
): string | null {
  if (!fileId) {
    return null;
  }
  if (isLocalDraftFileId(fileId)) {
    return (
      LocalDraftSessions.get(fileId)?.name?.trim() ||
      DEFAULT_DOCUMENT_DISPLAY_NAME
    );
  }
  return (
    readFileListTreeCache()
      ?.files.find((file) => file.id === fileId)
      ?.name?.trim() || null
  );
}

export function canonicalizeExcalidrawSceneFileName<
  T extends { appState?: unknown },
>(fileId: string, scene: T): T;
export function canonicalizeExcalidrawSceneFileName<
  T extends { appState?: unknown },
>(fileId: string, scene: T): T {
  const fileName = resolveCanonicalExcalidrawFileName(fileId);
  return fileName
    ? ({
        ...scene,
        appState: mergeAppStateWithServerFileName(scene.appState, fileName),
      } as T)
    : scene;
}
