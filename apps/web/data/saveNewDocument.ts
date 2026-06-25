import { traceUserAction, traceUserError } from "../lib/userTrace";

import { toMindMapLocalCacheRecord } from "../editors/mindmap/useMindMapFileSave";

import { DeltaStorage } from "./DeltaStorage";
import { buildAndCacheFileThumbnail } from "./thumbnailService";
import { FileSyncState } from "./FileSyncState";
import { hashDocumentSnapshot, hashSceneSnapshot } from "./sceneHash";
import { LocalThumbnailCache } from "./localThumbnailCache";
import { finalizeSavedThumbnail } from "./thumbnailLifecycle";
import { copyForkBrowserSceneBetweenFiles } from "./forkBrowserSceneStorage";
import { mergeAppStateWithServerFileName } from "./forkFileScene";
import { discardLocalDraftSession } from "./discardLocalDraftSession";
import { isLocalDraftFileId } from "./localDraftFileId";
import { DEFAULT_DOCUMENT_DISPLAY_NAME } from "./defaultDocumentName";
import { removeLocalDraftFromRecent } from "./localDraftSessions";
import { promoteRecentCatalogFile } from "./recentFiles";
import { clearTabFileDirty } from "./tabFileDirtyState";
import { ServerSync, type ServerFile } from "./ServerSync";
import {
  clearMindMapBrowserView,
  moveMindMapBrowserViewBetweenFiles,
  saveMindMapBrowserViewFromData,
} from "./mindMapBrowserViewStorage";

import { MindMapAdapter } from "./formats/MindMapAdapter";

import { isNativeMindMapThumbnailSvg } from "./thumbnailSvg";

import type { ManagedDocument } from "./documentTypes";
import type { MindMapDocumentData } from "./formats/MindMapAdapter";
import type { ForkSceneSnapshot } from "./forkFileTypes";

function resolveMindMapThumbnailForSave(
  draftId: string | null,
  explicit: string | null | undefined,
): string | null | undefined {
  if (explicit) {
    return explicit;
  }
  if (!draftId || !isLocalDraftFileId(draftId)) {
    return null;
  }
  const cached = LocalThumbnailCache.get(draftId);
  if (cached && isNativeMindMapThumbnailSvg(cached)) {
    return cached;
  }
  return null;
}

export async function saveNewDocument(opts: {
  kind: string;
  name: string;
  folderId: string | null;
  draftId?: string | null;
  excalidrawScene?: ForkSceneSnapshot | null;
  mindMapDocument?: ManagedDocument<MindMapDocumentData>;
  /** 原生 export 的 SVG；优先于示意图缩略图。 */
  mindMapThumbnail?: string | null;
  /** Native save dialog chose an existing catalog file; save into it instead of unique-renaming. */
  overwriteFile?: ServerFile | null;
}): Promise<{ id: string; kind: string }> {
  const finalName = opts.name.trim() || DEFAULT_DOCUMENT_DISPLAY_NAME;
  const kind = opts.kind;
  const draftId = opts.draftId ?? null;
  traceUserAction(
    "file-list",
    "saveNewDocument",
    {
      kind,
      name: finalName,
      draftId8: draftId?.slice(0, 12) ?? null,
      hasMindMap: !!opts.mindMapDocument,
      hasExcalidraw: !!opts.excalidrawScene,
    },
    "start",
  );

  try {
    if (draftId && isLocalDraftFileId(draftId)) {
      removeLocalDraftFromRecent(draftId);
    }

    const created =
      opts.overwriteFile ??
      (await ServerSync.createFile(finalName, opts.folderId, kind));
    const fileName = created.name || finalName;
    const initialExpectedVersion =
      typeof created.version === "number" ? created.version : null;

    if (kind === "mindmap") {
      const document = opts.mindMapDocument;
      if (!document) {
        throw new Error("没有可保存的 mindmap 内容");
      }
      const data = document.data;
      const persistData = { ...data };
      delete persistData.view;
      const persistDocument = MindMapAdapter.toDocument(persistData);
      if (draftId && isLocalDraftFileId(draftId)) {
        saveMindMapBrowserViewFromData(draftId, document);
        saveMindMapBrowserViewFromData(draftId, document.data);
        moveMindMapBrowserViewBetweenFiles(draftId, created.id);
      } else {
        if (opts.draftId) {
          clearMindMapBrowserView(opts.draftId);
        }
        clearMindMapBrowserView(created.id);
      }
      const hash = hashDocumentSnapshot(persistDocument);
      const thumbnail =
        resolveMindMapThumbnailForSave(draftId, opts.mindMapThumbnail) ??
        (await buildAndCacheFileThumbnail(
          created.id,
          {
            kind: "mindmap",
            data,
            nativeSvg: opts.mindMapThumbnail,
          },
          { sceneHash: hash },
        ));
      const saveResult = await ServerSync.saveFileImmediate(
        created.id,
        persistDocument,
        fileName,
        thumbnail,
        { expectedVersion: initialExpectedVersion, source: "create" },
      );
      const serverSha =
        saveResult.content_sha256 ?? FileSyncState.getServerHash(created.id);
      const savedVersion =
        typeof saveResult.version === "number"
          ? saveResult.version
          : typeof created.version === "number"
          ? created.version
          : null;
      FileSyncState.setLocalCache(
        created.id,
        typeof savedVersion === "number"
          ? toMindMapLocalCacheRecord(persistDocument, serverSha, savedVersion)
          : toMindMapLocalCacheRecord(persistDocument, serverSha),
      );
      FileSyncState.alignHashes(created.id, hash);
      if (thumbnail) {
        finalizeSavedThumbnail({
          fileId: created.id,
          kind: "mindmap",
          name: fileName,
          contentSha: serverSha ?? null,
          version: savedVersion,
          updatedAt: saveResult.updated_at ?? null,
          thumbnail,
        });
      }
    } else {
      const scene = opts.excalidrawScene;
      if (!scene) {
        throw new Error("没有可保存的画布内容");
      }
      const persistScene = {
        ...scene,
        appState: mergeAppStateWithServerFileName(scene.appState, fileName),
      };
      const sceneHash = hashSceneSnapshot(persistScene);
      const thumbnail = await buildAndCacheFileThumbnail(
        created.id,
        {
          kind: "excalidraw",
          data: {
            elements: persistScene.elements ?? [],
            appState: persistScene.appState ?? {},
            files: persistScene.files ?? {},
          },
        },
        { sceneHash },
      );
      const saveResult = await ServerSync.saveFileImmediate(
        created.id,
        persistScene,
        fileName,
        thumbnail,
        {
          suppressSavedEvent: true,
          expectedVersion: initialExpectedVersion,
          source: "create",
        },
      );
      FileSyncState.setLocalCache(created.id, {
        elements: persistScene.elements,
        appState: persistScene.appState,
        files: persistScene.files,
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
      const hash = hashSceneSnapshot(persistScene);
      FileSyncState.alignHashes(created.id, hash);
      await DeltaStorage.setFileId(created.id);
      if (draftId && isLocalDraftFileId(draftId)) {
        copyForkBrowserSceneBetweenFiles(draftId, created.id);
      }
      if (thumbnail) {
        finalizeSavedThumbnail({
          fileId: created.id,
          kind: "excalidraw",
          name: fileName,
          contentSha: saveResult.content_sha256 ?? null,
          version: saveResult.version ?? null,
          updatedAt: saveResult.updated_at ?? null,
          thumbnail,
        });
      }
    }

    if (draftId && isLocalDraftFileId(draftId)) {
      await discardLocalDraftSession(draftId);
    }

    const serverHash =
      FileSyncState.getServerHash(created.id) ?? created.content_sha256;
    if (serverHash) {
      FileSyncState.setServerHash(created.id, serverHash);
    }
    clearTabFileDirty(created.id);

    promoteRecentCatalogFile(draftId, created.id);
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

    traceUserAction(
      "file-list",
      "saveNewDocument",
      {
        id8: created.id.slice(0, 8),
        kind,
      },
      "ok",
    );
    return { id: created.id, kind };
  } catch (error) {
    traceUserError("file-list", "saveNewDocument", error, {
      kind,
      name: finalName,
    });
    throw error;
  }
}
