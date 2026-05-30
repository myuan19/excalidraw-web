import { getDocumentAdapter } from "@/features/documents";
import {
  createPlaceholderThumbnailSvg,
  LocalThumbnailCache,
  prepareStoredThumbnailSvg,
} from "@/features/thumbnail";
import {
  applySaveFileResult,
  BrowserSceneStorage,
  DeltaStorage,
  FileSyncState,
  LocalDraftStorage,
  LocalSceneCache,
} from "@/features/sync";
import { ServerSync } from "@/services/ServerSync";
import { useEditorStore } from "@/stores/editorStore";
import { useFileStore } from "@/stores/fileStore";
import type { ServerFile } from "@/types/file";
import { recordRecentFile } from "@/features/home/recentFiles";
import { syncFileDeepLink } from "@/features/routing/fileDeepLink";
import { isLocalTempFileId } from "./tempFileId";
import { TempFileStorage } from "./TempFileStorage";

export async function promoteTempFileToServer(name?: string): Promise<ServerFile> {
  const store = useEditorStore.getState();
  const { activeEditor, activeFile } = store;
  if (!activeEditor || !activeFile || !isLocalTempFileId(activeFile.id)) {
    throw new Error("当前没有可转正的本地临时文件");
  }

  store.flushPendingDraft();
  const finalName = (name ?? activeFile.name).trim() || "未命名";
  const tempId = activeFile.id;

  const saved = await activeEditor.saveData();
  const text = await saved.data.text();
  const rawData = JSON.parse(text);
  const adapter = getDocumentAdapter(activeFile.kind);
  const data = adapter
    ? adapter.toDocument(adapter.migrate(rawData) as never)
    : rawData;

  const thumbnailBlob = await activeEditor.getThumbnail(640, 384);
  const rawThumbnail = await thumbnailBlob.text();
  const thumbnail = rawThumbnail.includes("<svg")
    ? prepareStoredThumbnailSvg(rawThumbnail, activeFile.kind)
    : createPlaceholderThumbnailSvg({
      title: finalName,
      kind: activeFile.kind,
    });

  const serverFile = await useFileStore.getState().createFile(finalName, activeFile.kind);
  const result = await ServerSync.saveFileImmediate(
    serverFile.id,
    data,
    finalName,
    thumbnail,
    undefined,
  );
  const applied = applySaveFileResult(result, {
    updated_at: serverFile.updated_at,
    content_sha256: serverFile.content_sha256 ?? null,
  });

  LocalThumbnailCache.set(serverFile.id, thumbnail);
  FileSyncState.markSynced(serverFile.id, applied.content_sha256 ?? null);

  if (activeFile.kind === "excalidraw" && data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const scene = record.data && typeof record.data === "object"
      ? record.data as Record<string, unknown>
      : record;
    const browserScene = BrowserSceneStorage.get(tempId);
    if (browserScene) {
      BrowserSceneStorage.set(serverFile.id, browserScene);
    }
    LocalSceneCache.set(serverFile.id, {
      elements: scene.elements,
      appState: scene.appState,
      files: scene.files,
      deltas: [],
    });
    await DeltaStorage.setFileId(serverFile.id);
  }

  if (activeFile.kind === "mindmap") {
    LocalSceneCache.set(serverFile.id, { document: data, deltas: [] });
  }

  LocalDraftStorage.remove(tempId);
  LocalThumbnailCache.clear(tempId);
  FileSyncState.remove(tempId);
  TempFileStorage.remove(tempId);
  BrowserSceneStorage.remove(tempId);

  const fileStore = useFileStore.getState();
  fileStore.updateFile(serverFile.id, {
    updated_at: applied.updated_at,
    content_sha256: applied.content_sha256,
    has_thumbnail: true,
  });
  const existing = fileStore.files.some((f) => f.id === serverFile.id);
  if (!existing) {
    fileStore.setFiles([{ ...serverFile, ...applied, has_thumbnail: true }, ...fileStore.files]);
  }

  store.openFile(
    { ...serverFile, updated_at: applied.updated_at, content_sha256: applied.content_sha256, has_thumbnail: true },
    text,
  );
  recordRecentFile(serverFile.id);
  syncFileDeepLink(serverFile.id, serverFile.kind);

  window.dispatchEvent(
    new CustomEvent("file-sync-state-change", { detail: { fileId: serverFile.id } }),
  );

  return serverFile;
}
