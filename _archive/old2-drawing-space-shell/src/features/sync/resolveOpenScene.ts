import { FileSyncState } from "./FileSyncState";
import { LocalSceneCache, type LocalSceneCacheRecord } from "./localSceneCache";

export type OpenSceneSource = "local-cache" | "server" | "draft-string";

export interface ResolveOpenSceneInput {
  fileId: string;
  fileKind: string;
  serverDataText: string;
  serverHash: string | null;
  draftDataText: string | null;
}

export interface ResolveOpenSceneResult {
  dataText: string;
  source: OpenSceneSource;
  localCache?: LocalSceneCacheRecord | null;
}

function hasSceneContent(record: LocalSceneCacheRecord | null): boolean {
  if (!record) return false;
  if (Array.isArray(record.elements) && record.elements.length > 0) return true;
  if (record.document) return true;
  return false;
}

export function resolveOpenScene(input: ResolveOpenSceneInput): ResolveOpenSceneResult {
  const localRecord = LocalSceneCache.get(input.fileId);
  const serverNewer = FileSyncState.isServerChanged(input.fileId, input.serverHash);
  const localHasContent = hasSceneContent(localRecord);

  if (localHasContent && !serverNewer) {
    const dataText = localRecord?.document
      ? JSON.stringify(localRecord.document)
      : JSON.stringify({
        elements: localRecord?.elements ?? [],
        appState: localRecord?.appState ?? {},
        files: localRecord?.files ?? {},
      });
    return { dataText, source: "local-cache", localCache: localRecord };
  }

  if (input.draftDataText) {
    return { dataText: input.draftDataText, source: "draft-string", localCache: localRecord };
  }

  return { dataText: input.serverDataText, source: "server", localCache: localRecord };
}
