import {
  FileSyncState,
  LocalDraftStorage,
  resolveOpenPayload,
  resolveOpenScene,
  shouldFetchServerAfterCachedMindMapOpen,
} from "@/features/sync";
import { DeltaStorage } from "@/features/sync/DeltaStorage";
import { recordRecentFile } from "@/features/home/recentFiles";
import { syncFileDeepLink } from "@/features/routing/fileDeepLink";
import { isLocalTempFileId } from "@/features/tempFiles/tempFileId";
import { openTempDocumentFile } from "@/features/tempFiles/openTempDocumentFile";
import { TempFileStorage, tempRecordToServerFile } from "@/features/tempFiles/TempFileStorage";
import { ServerSync } from "@/services/ServerSync";
import { editorDebugLog } from "@/features/logging/editorDebugLog";
import { useEditorStore } from "@/stores/editorStore";
import type { ServerFile } from "@/types/file";

export interface OpenDocumentOptions {
  confirmChoice?: (message: string) => boolean;
  syncUrl?: boolean;
}

export async function openDocumentFile(
  file: ServerFile,
  options: OpenDocumentOptions = {},
): Promise<void> {
  editorDebugLog("openDocumentFile.enter", {
    fileId: file.id,
    fileName: file.name,
    kind: file.kind,
    isTemp: isLocalTempFileId(file.id),
  });
  if (isLocalTempFileId(file.id)) {
    await openTempDocumentFile(file);
    return;
  }

  const confirmChoice = options.confirmChoice ?? ((message: string) => confirm(message));
  const loaded = await ServerSync.getFile(file.id);
  const draft = LocalDraftStorage.get(file.id);
  const scene = resolveOpenScene({
    fileId: file.id,
    fileKind: file.kind,
    serverDataText: JSON.stringify(loaded.data ?? {}),
    serverHash: loaded.content_sha256 ?? null,
    draftDataText: draft?.data ?? null,
  });
  const payload = scene.source === "draft-string"
    ? resolveOpenPayload({
      fileName: file.name,
      serverDataText: scene.dataText,
      serverHash: loaded.content_sha256 ?? null,
      draft,
      hasServerChanged: FileSyncState.hasServerChangedSinceBaseline(
        file.id,
        loaded.content_sha256 ?? null,
      ),
      confirmChoice,
    })
    : {
      dataText: scene.dataText,
      source: scene.source === "local-cache" ? "draft" as const : "server" as const,
      clearDraft: false,
    };
  if (file.kind === "excalidraw" && scene.localCache?.deltas?.length) {
    await DeltaStorage.restoreSnapshot(file.id, scene.localCache.deltas);
  }
  if (payload.clearDraft) {
    LocalDraftStorage.remove(file.id);
    FileSyncState.clearDraft(file.id);
  }
  editorDebugLog("openDocumentFile.beforeOpenFile", {
    fileId: file.id,
    payloadSource: payload.source,
    dataTextLength: payload.dataText.length,
    clearDraft: payload.clearDraft,
  });
  useEditorStore.getState().openFile(loaded, payload.dataText);
  recordRecentFile(file.id);
  editorDebugLog("openDocumentFile.done", { fileId: file.id });
  if (options.syncUrl !== false) {
    syncFileDeepLink(file.id, file.kind);
  }
  if (
    file.kind === "mindmap" &&
    payload.source === "draft" &&
    shouldFetchServerAfterCachedMindMapOpen({
      hasUnsavedChanges: false,
      localServerHash: FileSyncState.get(file.id)?.serverHash,
      remoteServerHash: loaded.content_sha256 ?? null,
    })
  ) {
    void ServerSync.getFile(file.id).then((remote) => {
      if (FileSyncState.hasUnsavedChanges(file.id)) return;
      useEditorStore.getState().openFile(remote, JSON.stringify(remote.data ?? {}));
    }).catch(() => undefined);
  }
}

export async function openDocumentById(
  fileId: string,
  options: OpenDocumentOptions = {},
): Promise<ServerFile | null> {
  if (isLocalTempFileId(fileId)) {
    const record = TempFileStorage.get(fileId);
    if (!record) return null;
    const file = tempRecordToServerFile(record);
    await openTempDocumentFile(file);
    return file;
  }

  const loaded = await ServerSync.getFile(fileId);
  await openDocumentFile(loaded, options);
  return loaded;
}
