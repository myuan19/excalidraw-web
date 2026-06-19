import { ServerSync } from "./ServerSync";

/**
 * Existing-file saves preserve the server/file-list business name.
 * Excalidraw appState.name is editor payload and must not rename documents
 * unless a dedicated business rename flow updates server metadata.
 */
export async function resolveSaveDisplayName(fileId: string): Promise<string> {
  const serverFile = await ServerSync.getFile(fileId);
  return serverFile.name;
}
