import { toMindMapLocalCacheRecord } from "../editors/mindmap/useMindMapFileSave";

import { DeltaStorage } from "./DeltaStorage";
import { DEFAULT_DOCUMENT_DISPLAY_NAME } from "./defaultDocumentName";
import { discardLocalDraftSession } from "./discardLocalDraftSession";
import { buildAndCacheFileThumbnail } from "./thumbnailService";
import { FileSyncState } from "./FileSyncState";
import { copyForkBrowserSceneBetweenFiles } from "./forkBrowserSceneStorage";
import { forkSceneSnapshotWithServerName } from "./forkFileScene";
import {
  createMindMapRootText,
  isMindMapSingleRootOnly,
  MindMapAdapter,
} from "./formats/MindMapAdapter";
import { isLocalDraftFileId } from "./localDraftFileId";
import { LocalThumbnailCache } from "./localThumbnailCache";
import {
  clearMindMapBrowserView,
  moveMindMapBrowserViewBetweenFiles,
  saveMindMapBrowserViewFromData,
} from "./mindMapBrowserViewStorage";
import {
  promoteRecentCatalogFile,
  recordRecentFileAccess,
  removeRecentFileEntry,
} from "./recentFiles";
import { hashDocumentSnapshot, hashSceneSnapshot } from "./sceneHash";
import { ServerSync } from "./ServerSync";

import type { ManagedDocument } from "./documentTypes";
import type { MindMapDocumentData } from "./formats/MindMapAdapter";
import type { ForkSceneSnapshot } from "./forkFileTypes";

export async function saveNewDocument(opts: {
  kind: string;
  name: string;
  folderId: string | null;
  draftId?: string | null;
  excalidrawScene?: ForkSceneSnapshot | null;
  mindMapDocument?: ManagedDocument<MindMapDocumentData>;
  /** Native simple-mind-map export SVG. */
  mindMapThumbnail?: string | null;
}): Promise<{ id: string; kind: string }> {
  const finalName = opts.name.trim() || DEFAULT_DOCUMENT_DISPLAY_NAME;
  const kind = opts.kind;
  const draftId = opts.draftId ?? null;
  if (draftId && isLocalDraftFileId(draftId)) {
    removeRecentFileEntry(draftId);
  }
  const created = await ServerSync.createFile(finalName, opts.folderId, kind);

  if (kind === "mindmap") {
    const document = opts.mindMapDocument;
    if (!document) {
      throw new Error("没有可保存的 mindmap 内容");
    }
    const shouldSyncSingleRootName = isMindMapSingleRootOnly(document);
    const data = shouldSyncSingleRootName
      ? {
          ...document.data,
          root: {
            ...document.data.root,
            data: {
              ...document.data.root.data,
              text: createMindMapRootText(finalName),
              richText: true,
            },
          },
        }
      : document.data;
    const persistDocument = isMindMapSingleRootOnly(document)
      ? MindMapAdapter.toDocument({ ...data, view: undefined })
      : document;
    if (draftId && isLocalDraftFileId(draftId)) {
      saveMindMapBrowserViewFromData(draftId, document);
      saveMindMapBrowserViewFromData(draftId, document.data);
      moveMindMapBrowserViewBetweenFiles(draftId, created.id);
    } else if (shouldSyncSingleRootName) {
      if (draftId) {
        clearMindMapBrowserView(draftId);
      }
      clearMindMapBrowserView(created.id);
    }
    const thumbnail =
      opts.mindMapThumbnail ??
      (await buildAndCacheFileThumbnail(created.id, {
        kind: "mindmap",
        data,
      }));
    const saveResult = await ServerSync.saveFileImmediate(
      created.id,
      persistDocument,
      finalName,
      thumbnail,
      { source: "promote-mindmap" },
    );
    FileSyncState.setServerSyncedLocalCache(
      created.id,
      toMindMapLocalCacheRecord(
        persistDocument,
        saveResult.content_sha256 ??
          FileSyncState.getServerHash(created.id) ??
          undefined,
        saveResult.version,
      ),
    );
    const hash = hashDocumentSnapshot(persistDocument);
    FileSyncState.alignHashes(created.id, hash);
    if (thumbnail) {
      LocalThumbnailCache.set(created.id, thumbnail);
    }
  } else {
    const scene = opts.excalidrawScene;
    if (!scene) {
      throw new Error("没有可保存的画布内容");
    }
    const sceneForSave = forkSceneSnapshotWithServerName(scene, finalName);
    const thumbnail = await buildAndCacheFileThumbnail(created.id, {
      kind: "excalidraw",
      data: {
        elements: sceneForSave.elements ?? [],
        appState: sceneForSave.appState ?? {},
        files: sceneForSave.files ?? {},
      },
    });
    const saveResult = await ServerSync.saveFileImmediate(
      created.id,
      sceneForSave,
      finalName,
      thumbnail,
      { suppressSavedEvent: true, source: "promote-excalidraw" },
    );
    FileSyncState.setServerSyncedLocalCache(created.id, {
      elements: sceneForSave.elements,
      appState: sceneForSave.appState,
      files: sceneForSave.files,
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
    const hash = hashSceneSnapshot(sceneForSave);
    FileSyncState.alignHashes(created.id, hash);
    await DeltaStorage.setFileId(created.id);
    if (draftId && isLocalDraftFileId(draftId)) {
      copyForkBrowserSceneBetweenFiles(draftId, created.id);
    }
    if (thumbnail) {
      LocalThumbnailCache.set(created.id, thumbnail);
    }
  }

  if (draftId && isLocalDraftFileId(draftId)) {
    await discardLocalDraftSession(draftId);
  }

  const savedContentSha =
    kind === "mindmap" || kind === "excalidraw"
      ? FileSyncState.getServerHash(created.id)
      : created.content_sha256 ?? null;
  if (savedContentSha) {
    FileSyncState.setServerHash(created.id, savedContentSha);
  }

  if (draftId && isLocalDraftFileId(draftId)) {
    promoteRecentCatalogFile(draftId, created.id);
  } else {
    recordRecentFileAccess(created.id);
  }
  window.dispatchEvent(
    new CustomEvent("excalidraw-server-saved", {
      detail: {
        id: created.id,
        hash: FileSyncState.getBaselineHash(created.id),
      },
    }),
  );
  window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
  window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));

  return { id: created.id, kind };
}
