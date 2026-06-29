import { findFileInTreeCache } from "./fileListSessionCache";
import { mergeAppStateWithServerFileName } from "./forkFileScene";
import { getLocalDraftDisplayName } from "./localDraftDisplayName";
import { isLocalDraftFileId } from "./localDraftFileId";

/**
 * EditorHub document names are business metadata. Keep the authority here so
 * Excalidraw appState defaults cannot rename managed files through save/cache
 * paths.
 */
export function resolveCanonicalExcalidrawFileName(
  fileId: string | null,
): string | null {
  if (!fileId) {
    return null;
  }
  if (isLocalDraftFileId(fileId)) {
    return getLocalDraftDisplayName(fileId);
  }
  return findFileInTreeCache(fileId)?.name?.trim() || null;
}

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
