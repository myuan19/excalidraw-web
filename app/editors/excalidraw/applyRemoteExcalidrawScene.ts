import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

import { DeltaStorage } from "../../data/DeltaStorage";
import { FileSyncState } from "../../data/FileSyncState";
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
  await DeltaStorage.restoreSnapshot([]);

  const currentAppState = excalidrawAPI.getAppState();
  const restoredAppState = restoreSceneAppState(mergedAppState, {
    openSidebar: currentAppState.openSidebar,
    ...(preserveViewport
      ? pickSceneViewportAppState(currentAppState)
      : {}),
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

  FileSyncState.setLocalCache(fileId, {
    elements: serverData.elements,
    appState: mergedAppState,
    files: serverData.files,
    deltas: [],
  });

  revealForkCanvasAfterFit(excalidrawAPI, () => {}, {
    skipFit: preserveViewport,
  });
  window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
  window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
  return true;
}
