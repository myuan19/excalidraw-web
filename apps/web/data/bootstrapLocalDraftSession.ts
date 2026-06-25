import { DeltaStorage } from "./DeltaStorage";
import { FileSyncState } from "./FileSyncState";
import { createBlankExcalidrawInitialScene } from "./forkFileScene";
import {
  createEmptyMindMapData,
  MindMapAdapter,
} from "./formats/MindMapAdapter";
import { generateExcalidrawThumbnailAndCache } from "./excalidrawThumbnail";
import { generateMindMapThumbnailAndCache } from "./mindMapThumbnail";
import { hashDocumentSnapshot, hashSceneSnapshot } from "./sceneHash";
import { defaultNameForDocumentKind } from "./defaultDocumentName";
import { createLocalDraftFileId } from "./localDraftFileId";
import {
  LocalDraftSessions,
  type LocalDraftSaveTarget,
} from "./localDraftSessions";
import { devDebug } from "../lib/devDebug";

import { toMindMapLocalCacheRecord } from "../editors/mindmap/useMindMapFileSave";

/**
 * 新建未保存文档：分配 local-draft id，用与正式文件相同的浏览器持久化键初始化。
 * 不写入「最近」；首次产生未保存编辑时由 notifyLocalDraftEdited 加入。
 */
export async function bootstrapLocalDraftSession(
  kind: string,
  opts?: { folderId?: string | null; saveTarget?: LocalDraftSaveTarget },
): Promise<{ id: string; kind: string }> {
  const now = new Date().toISOString();
  const id = createLocalDraftFileId();
  const displayName = defaultNameForDocumentKind(kind);
  devDebug("api-sync", "bootstrapLocalDraftSession | start", {
    id8: id.slice(0, 20),
    kind,
    folderId: opts?.folderId ?? null,
    saveTarget: opts?.saveTarget ?? null,
  });

  LocalDraftSessions.upsert({
    id,
    name: displayName,
    kind,
    created_at: now,
    updated_at: now,
    ...(opts?.folderId !== undefined ? { folder_id: opts.folderId } : {}),
    ...(opts?.saveTarget ? { save_target: opts.saveTarget } : {}),
  });

  await DeltaStorage.setFileId(id);

  if (kind === "mindmap") {
    const data = createEmptyMindMapData(displayName);
    const document = MindMapAdapter.toDocument(data);
    FileSyncState.setLocalCache(id, toMindMapLocalCacheRecord(document));
    const hash = hashDocumentSnapshot(document);
    FileSyncState.alignHashes(id, hash);
    await generateMindMapThumbnailAndCache(id, data);
  } else {
    const initialScene = createBlankExcalidrawInitialScene(displayName);
    FileSyncState.setLocalCache(id, {
      elements: initialScene.elements,
      appState: initialScene.appState,
      files: initialScene.files,
      deltas: [],
    });
    const hash = hashSceneSnapshot(initialScene);
    FileSyncState.alignHashes(id, hash);
    await generateExcalidrawThumbnailAndCache(id, initialScene);
  }

  devDebug("api-sync", "bootstrapLocalDraftSession | ok", {
    id8: id.slice(0, 20),
    kind,
  });
  return { id, kind };
}
