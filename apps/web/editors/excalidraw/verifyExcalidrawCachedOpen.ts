import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { createLogger } from "../../lib/logger";
import {
  shouldFetchServerAfterCachedOpen,
  type EditorOpenPhase,
} from "../../lib/editorOpenPhases";
import {
  applyServerFileSessionVersion,
  ensureSessionVersionAfterCacheOpen,
} from "../../data/documentSessionVersionSync";
import { FileSyncState } from "../../data/FileSyncState";
import { isLocalDraftFileId } from "../../data/localDraftFileId";
import { runRemoteFileApply } from "../../data/fileSyncOperationState";
import { ServerSync } from "../../data/ServerSync";

import { applyRemoteExcalidrawScene } from "./applyRemoteExcalidrawScene";

const logVerify = createLogger({ module: "init.scene" });

/**
 * After opening from local cache with unsaved edits, check whether the server
 * moved ahead and apply remotely while preserving the current viewport.
 */
export async function verifyExcalidrawRemoteAfterCachedOpen(opts: {
  fileId: string;
  excalidrawAPI: ExcalidrawImperativeAPI;
  onPhase?: (phase: EditorOpenPhase) => void;
  runRemoteSceneApply?: <T>(apply: () => Promise<T>) => Promise<T>;
}): Promise<boolean> {
  const { fileId, excalidrawAPI } = opts;

  if (isLocalDraftFileId(fileId)) {
    opts.onPhase?.("ready");
    return false;
  }

  const hasUnsavedChanges = FileSyncState.hasUnsavedChanges(fileId);
  opts.onPhase?.("checking_remote");

  await ensureSessionVersionAfterCacheOpen(fileId, {
    listFileHashes: () => ServerSync.listFileHashes(),
    cacheVersion:
      FileSyncState.getLocalCache(fileId)?.meta?.serverVersion ?? null,
    hasUnsavedChanges,
    cachedServerSha:
      FileSyncState.getServerHash(fileId) ??
      FileSyncState.getLocalCache(fileId)?.meta?.serverContentSha256 ??
      null,
    reason: "verify-cached-open",
  });

  let remoteHash: string | null = null;
  let remoteVersion: number | undefined;
  try {
    const hashes = await ServerSync.listFileHashes();
    const remoteEntry = hashes.find((entry) => entry.id === fileId);
    remoteHash = remoteEntry?.content_sha256 ?? null;
    remoteVersion = remoteEntry?.version;
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
    if (!hasUnsavedChanges) {
      applyServerFileSessionVersion(fileId, remoteVersion, "verify-aligned");
    }
    opts.onPhase?.("ready");
    return false;
  }

  opts.onPhase?.("background_sync");
  const runRemoteSceneApply =
    opts.runRemoteSceneApply ??
    (<T>(apply: () => Promise<T>) => runRemoteFileApply(fileId, apply));
  try {
    const serverRecord = await ServerSync.getFile(fileId);
    const apply = () =>
      applyRemoteExcalidrawScene({
        excalidrawAPI,
        fileId,
        serverFile: serverRecord,
        preserveViewport: true,
      });
    const applied = await runRemoteSceneApply(apply);
    opts.onPhase?.("ready");
    return applied;
  } catch (err) {
    logVerify.debug(`file=${fileId.slice(0, 8)} background verify failed`, err);
    opts.onPhase?.("ready");
    return false;
  }
}
