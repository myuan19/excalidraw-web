import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type {
  AppState,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  BinaryFiles,
} from "@excalidraw/excalidraw/types";

import { createLogger } from "../../lib/logger";
import {
  shouldFetchServerAfterCachedOpen,
  type EditorOpenPhase,
} from "../../lib/editorOpenPhases";
import { DeltaStorage } from "../../data/DeltaStorage";
import { FileSyncState } from "../../data/FileSyncState";
import {
  clearForkBrowserScene,
  readForkBrowserAppStateOverlay,
} from "../../data/forkBrowserSceneStorage";
import { isExcalidrawDraftDirty } from "../../data/draftDirty";
import { getFileIdFromHash } from "../../data/fileIdFromHash";
import { hashSceneSnapshot } from "../../data/sceneHash";
import { createBlankExcalidrawInitialScene } from "../../data/forkFileScene";
import { isLocalDraftFileId } from "../../data/localDraftFileId";
import { restoreSceneAppState, restoreSceneElements } from "../../data/sceneRestore";
import { LocalDraftSessions } from "../../data/localDraftSessions";
import { ServerSync } from "../../data/ServerSync";

import type { ForkLocalCacheRecord, ForkSceneSnapshot } from "../../data/forkFileTypes";

const logInit = createLogger({ module: "init.scene" });

export type ExcalidrawInitSceneResult = {
  scene: ExcalidrawInitialDataState | null;
  isExternalScene: false;
  hasBrowserViewport: boolean;
  /** When true, open used local cache; remote hash check runs after first paint. */
  deferRemoteVerify: boolean;
};

const EMPTY_INIT_RESULT: ExcalidrawInitSceneResult = {
  scene: { elements: [], appState: {}, scrollToContent: true },
  isExternalScene: false,
  hasBrowserViewport: false,
  deferRemoteVerify: false,
};

function buildInitResult(
  data: ForkSceneSnapshot,
  overlay: Partial<AppState> | null,
): Pick<ExcalidrawInitSceneResult, "scene" | "hasBrowserViewport"> {
  return {
    scene: {
      elements: restoreSceneElements(data.elements),
      appState: restoreSceneAppState(data.appState, overlay),
      files: (data.files || {}) as BinaryFiles,
      ...(overlay ? {} : { scrollToContent: true }),
    },
    hasBrowserViewport: !!overlay,
  };
}

async function loadLocalSnapshot(
  fileId: string,
  localRecord: ForkLocalCacheRecord,
  forkBrowserOverlay: Partial<AppState> | null,
): Promise<ExcalidrawInitSceneResult> {
  const draftH = hashSceneSnapshot(localRecord);
  const existingBaseline = FileSyncState.getBaselineHash(fileId);
  if (!existingBaseline) {
    FileSyncState.setBaselineHash(fileId, draftH);
  }
  FileSyncState.setDraftHash(fileId, draftH);
  await DeltaStorage.restoreSnapshot(localRecord.deltas);
  return {
    ...buildInitResult(localRecord, forkBrowserOverlay),
    isExternalScene: false,
    deferRemoteVerify: true,
  };
}

async function loadBlockingFromServer(
  fileId: string,
  serverNewerThanLocal: boolean,
  localRecord: ForkLocalCacheRecord | null,
  localHasContent: boolean,
  forkBrowserOverlay: Partial<AppState> | null,
  onPhase?: (phase: EditorOpenPhase) => void,
): Promise<ExcalidrawInitSceneResult> {
  if (serverNewerThanLocal || !localHasContent) {
    onPhase?.("loading_remote");
  }

  let serverData: ForkSceneSnapshot | null = null;
  let serverRecord: Awaited<ReturnType<typeof ServerSync.getFile>> | null = null;
  try {
    serverRecord = await ServerSync.getFile(fileId);
    if (serverRecord.data && typeof serverRecord.data === "object") {
      serverData = serverRecord.data as ForkSceneSnapshot;
    }
  } catch (err) {
    logInit.debug(`file=${fileId.slice(0, 8)} server fetch failed`, err);
  }

  if (localHasContent && !serverData && localRecord) {
    const draftH = hashSceneSnapshot(localRecord);
    FileSyncState.alignHashes(fileId, draftH);
    await DeltaStorage.restoreSnapshot(localRecord.deltas);
    return {
      ...buildInitResult(localRecord, forkBrowserOverlay),
      isExternalScene: false,
      deferRemoteVerify: false,
    };
  }

  if (serverData) {
    const mergedAppState = {
      ...(serverData.appState ?? {}),
      name: serverRecord?.name ?? (serverData.appState as AppState)?.name ?? "",
    };
    const h = hashSceneSnapshot(serverData);
    FileSyncState.alignHashes(fileId, h);
    if (serverRecord?.content_sha256) {
      FileSyncState.setServerHash(fileId, serverRecord.content_sha256);
    }
    FileSyncState.setLocalCache(fileId, {
      elements: serverData.elements,
      appState: mergedAppState,
      files: serverData.files,
      deltas: [],
    });
    await DeltaStorage.restoreSnapshot([]);
    return {
      ...buildInitResult({ ...serverData, appState: mergedAppState }, forkBrowserOverlay),
      isExternalScene: false,
      deferRemoteVerify: false,
    };
  }

  return { ...EMPTY_INIT_RESULT, deferRemoteVerify: false };
}

export async function initializeExcalidrawScene(opts?: {
  onPhase?: (phase: EditorOpenPhase) => void;
}): Promise<ExcalidrawInitSceneResult> {
  const onPhase = opts?.onPhase;
  const fileIdFromHash = getFileIdFromHash();
  if (!fileIdFromHash) {
    onPhase?.("ready");
    return EMPTY_INIT_RESULT;
  }

  const fid8 = fileIdFromHash.slice(0, 8);
  onPhase?.("resolving");
  logInit.debug(`initializeScene file=${fid8}`);
  await DeltaStorage.setFileId(fileIdFromHash);

  if (isLocalDraftFileId(fileIdFromHash)) {
    let localRecord = FileSyncState.getLocalCache(fileIdFromHash);
    if (!localRecord) {
      const label =
        LocalDraftSessions.get(fileIdFromHash)?.name ?? "未命名";
      const initialScene = createBlankExcalidrawInitialScene(label);
      FileSyncState.setLocalCache(fileIdFromHash, {
        elements: initialScene.elements,
        appState: initialScene.appState,
        files: initialScene.files,
        deltas: [],
      });
      FileSyncState.alignHashes(
        fileIdFromHash,
        hashSceneSnapshot(initialScene),
      );
      localRecord = FileSyncState.getLocalCache(fileIdFromHash);
    }
    if (localRecord) {
      onPhase?.("preparing_surface");
      if (!isExcalidrawDraftDirty(localRecord)) {
        clearForkBrowserScene(fileIdFromHash);
      }
      const overlay = isExcalidrawDraftDirty(localRecord)
        ? readForkBrowserAppStateOverlay(fileIdFromHash)
        : null;
      return loadLocalSnapshot(fileIdFromHash, localRecord, overlay);
    }
  }

  const localRecord = FileSyncState.getLocalCache(fileIdFromHash);
  const localElements = Array.isArray((localRecord as ForkSceneSnapshot | null)?.elements)
    ? ((localRecord as ForkSceneSnapshot).elements as unknown[])
    : [];
  const localHasContent = localElements.length > 0;
  const hasUnsavedChanges = FileSyncState.hasUnsavedChanges(fileIdFromHash);
  const forkBrowserOverlay = readForkBrowserAppStateOverlay(fileIdFromHash);

  if (localHasContent && localRecord) {
    onPhase?.(hasUnsavedChanges ? "restoring_draft" : "preparing_surface");
    logInit.debug(`file=${fid8} → use LOCAL fast path, unsaved=${hasUnsavedChanges}`);
    const result = await loadLocalSnapshot(
      fileIdFromHash,
      localRecord,
      forkBrowserOverlay,
    );
    onPhase?.("preparing_surface");
    return result;
  }

  onPhase?.("checking_remote");
  let serverNewerThanLocal = false;
  try {
    const hashes = await ServerSync.listFileHashes();
    const entry = hashes.find((h) => h.id === fileIdFromHash);
    if (entry?.content_sha256) {
      serverNewerThanLocal = FileSyncState.isServerChanged(
        fileIdFromHash,
        entry.content_sha256,
      );
      FileSyncState.setServerHash(fileIdFromHash, entry.content_sha256);
    }
  } catch {
    logInit.debug(`file=${fid8} hash fetch failed (offline?)`);
  }

  const blocking = await loadBlockingFromServer(
    fileIdFromHash,
    serverNewerThanLocal,
    localRecord,
    localHasContent,
    forkBrowserOverlay,
    onPhase,
  );
  onPhase?.("preparing_surface");
  return blocking;
}

export async function verifyExcalidrawRemoteAfterCachedOpen(opts: {
  excalidrawAPI: ExcalidrawImperativeAPI;
  onPhase?: (phase: EditorOpenPhase) => void;
}): Promise<boolean> {
  const fileId = getFileIdFromHash();
  if (!fileId) {
    opts.onPhase?.("ready");
    return false;
  }

  if (isLocalDraftFileId(fileId)) {
    opts.onPhase?.("ready");
    return false;
  }

  const hasUnsavedChanges = FileSyncState.hasUnsavedChanges(fileId);
  opts.onPhase?.("checking_remote");

  let remoteHash: string | null = null;
  try {
    const hashes = await ServerSync.listFileHashes();
    remoteHash =
      hashes.find((entry) => entry.id === fileId)?.content_sha256 ?? null;
  } catch {
    opts.onPhase?.("ready");
    return false;
  }

  if (
    !shouldFetchServerAfterCachedOpen({
      hasUnsavedChanges,
      localServerHash: FileSyncState.getServerHash(fileId),
      remoteServerHash: remoteHash,
    })
  ) {
    if (remoteHash) {
      FileSyncState.setServerHash(fileId, remoteHash);
    }
    opts.onPhase?.("ready");
    return false;
  }

  opts.onPhase?.("background_sync");
  try {
    const serverRecord = await ServerSync.getFile(fileId);
    const serverData = serverRecord.data as ForkSceneSnapshot | undefined;
    if (!serverData || typeof serverData !== "object") {
      opts.onPhase?.("ready");
      return false;
    }

    const mergedAppState = {
      ...(serverData.appState ?? {}),
      name: serverRecord.name ?? (serverData.appState as AppState)?.name ?? "",
    };
    const h = hashSceneSnapshot(serverData);
    FileSyncState.alignHashes(fileId, h);
    if (serverRecord.content_sha256) {
      FileSyncState.setServerHash(fileId, serverRecord.content_sha256);
    }
    FileSyncState.setLocalCache(fileId, {
      elements: serverData.elements,
      appState: mergedAppState,
      files: serverData.files,
      deltas: [],
    });
    await DeltaStorage.restoreSnapshot([]);

    const forkBrowserOverlay = readForkBrowserAppStateOverlay(fileId);
    const { scene } = buildInitResult(
      { ...serverData, appState: mergedAppState },
      forkBrowserOverlay,
    );
    if (scene) {
      opts.excalidrawAPI.updateScene({
        elements: scene.elements,
        appState: restoreSceneAppState(scene.appState ?? {}),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      const sceneFiles = (scene.files ?? {}) as BinaryFiles;
      if (Object.keys(sceneFiles).length > 0) {
        opts.excalidrawAPI.addFiles(Object.values(sceneFiles));
      }
    }
    window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
    opts.onPhase?.("ready");
    return true;
  } catch (err) {
    logInit.debug(`file=${fileId.slice(0, 8)} background verify failed`, err);
    opts.onPhase?.("ready");
    return false;
  }
}
