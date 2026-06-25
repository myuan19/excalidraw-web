import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

import { DeltaStorage } from "../../data/DeltaStorage";
import { FileSyncState } from "../../data/FileSyncState";
import { getDocumentSessionVersion } from "../../data/documentSessionVersion";
import {
  applyServerFileSessionVersion,
  updateLocalCacheServerVersionMeta,
} from "../../data/documentSessionVersionSync";
import { logDocumentVersion } from "../../data/documentVersionLog";
import { runRemoteFileApply } from "../../data/fileSyncOperationState";
import type { ForkSceneSnapshot } from "../../data/forkFileTypes";
import { hashSceneSnapshot } from "../../data/sceneHash";
import {
  pickSceneViewportAppState,
  restoreSceneAppState,
  restoreSceneElements,
} from "../../data/sceneRestore";
import { revealForkCanvasAfterFit } from "../../data/scrollEditorToFit";
import { clearTabFileDirty } from "../../data/tabFileDirtyState";

export type RemoteExcalidrawServerFile = {
  data?: unknown;
  name?: string | null;
  content_sha256?: string | null;
  version?: number;
};

export function isForkSceneSnapshot(data: unknown): data is ForkSceneSnapshot {
  return !!data && typeof data === "object";
}

export function mergeRemoteExcalidrawAppState(
  serverData: ForkSceneSnapshot,
  serverName?: string | null,
): Partial<AppState> {
  return {
    ...(serverData.appState ?? {}),
    name: serverName ?? (serverData.appState as AppState)?.name ?? "",
  };
}

export async function applyRemoteExcalidrawScene(opts: {
  excalidrawAPI: ExcalidrawImperativeAPI;
  fileId: string;
  serverFile: RemoteExcalidrawServerFile;
  preserveViewport: boolean;
}): Promise<boolean> {
  const { excalidrawAPI, fileId, serverFile, preserveViewport } = opts;
  const serverData = serverFile.data;
  if (!isForkSceneSnapshot(serverData)) {
    return false;
  }

  return runRemoteFileApply(fileId, async () => {
    const mergedAppState = mergeRemoteExcalidrawAppState(
      serverData,
      serverFile.name,
    );
    const contentHash = hashSceneSnapshot(serverData);

    FileSyncState.alignHashes(fileId, contentHash);
    clearTabFileDirty(fileId);
    if (serverFile.content_sha256) {
      FileSyncState.setServerHash(fileId, serverFile.content_sha256);
    }
    applyServerFileSessionVersion(fileId, serverFile.version, "remote-apply");
    await DeltaStorage.restoreSnapshot([]);

    const currentAppState = excalidrawAPI.getAppState();
    const restoredAppState = restoreSceneAppState(mergedAppState, {
      openSidebar: currentAppState.openSidebar,
      ...(preserveViewport ? pickSceneViewportAppState(currentAppState) : {}),
    });

    excalidrawAPI.updateScene({
      elements: restoreSceneElements(serverData.elements),
      appState: restoredAppState,
      captureUpdate: CaptureUpdateAction.NEVER,
    });

    const files = (serverData.files || {}) as BinaryFiles;
    if (Object.keys(files).length > 0) {
      excalidrawAPI.addFiles(Object.values(files));
    }

    FileSyncState.setServerSyncedLocalCache(fileId, {
      elements: serverData.elements,
      appState: mergedAppState,
      files: serverData.files,
      deltas: [],
      meta: {
        ...(serverFile.content_sha256
          ? { serverContentSha256: serverFile.content_sha256 }
          : {}),
        ...(typeof serverFile.version === "number"
          ? { serverVersion: serverFile.version }
          : {}),
      },
    });
    updateLocalCacheServerVersionMeta(
      fileId,
      {
        content_sha256: serverFile.content_sha256 ?? null,
        version: serverFile.version ?? null,
      },
      "remote-apply",
    );

    if (typeof serverFile.version === "number") {
      logDocumentVersion({
        action: "cache-meta",
        fileId,
        reason: "remote-apply",
        cacheVersion: serverFile.version,
        serverVersion: serverFile.version,
        sessionVersion: getDocumentSessionVersion(fileId),
      });
    }

    revealForkCanvasAfterFit(excalidrawAPI, () => {}, {
      skipFit: preserveViewport,
    });
    window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
    window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
    return true;
  });
}
