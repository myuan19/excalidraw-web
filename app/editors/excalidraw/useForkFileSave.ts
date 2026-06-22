import { useCallback, useEffect, useRef, useState } from "react";
import { debounce } from "@excalidraw/common";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { createLogger } from "../../lib/logger";
import { DeltaStorage } from "../../data/DeltaStorage";
import { discardLocalEditsNavigateHome } from "../../data/fileEditSession";
import { FileSyncState } from "../../data/FileSyncState";
import { hashSceneSnapshot } from "../../data/sceneHash";
import { LocalData } from "../../data/LocalData";
import {
  applyFileModificationState,
  evaluateCurrentFileModificationState,
} from "../../data/fileModificationState";
import {
  generateExcalidrawThumbnailAndCache,
  scheduleExcalidrawThumbnailAndCache,
} from "../../data/excalidrawThumbnail";
import { canonicalizeExcalidrawSceneFileName } from "../../data/excalidrawFileNameAuthority";
import { resolveSaveDisplayName } from "../../data/forkFileNaming";
import { mergeAppStateWithServerFileName } from "../../data/forkFileScene";
import {
  getServerSyncErrorJson,
  isServerSyncVersionConflictError,
  ServerSync,
  type PutFileResult,
} from "../../data/ServerSync";
import { getFileIdFromHash } from "../../data/fileIdFromHash";
import { shouldDeferLeaveWhileNewDocumentHash } from "../../data/editorLeaveHome";
import { isLocalDraftFileId } from "../../data/localDraftFileId";
import { finalizeSavedThumbnail } from "../../data/thumbnailLifecycle";
import { notifyLocalDraftEdited } from "../../data/localDraftSessions";
import { discardLocalDraftSession } from "../../data/discardLocalDraftSession";
import { getLocalDraftDisplayName } from "../../data/localDraftDisplayName";
import { clearAppShellPendingNavigation } from "../../shell/appShellNavigate";
import {
  promptLeaveEditorConfirm,
  promptLocalDraftLossConfirm,
  promptServerUpdateConfirm,
} from "../../shell/editorLeaveConfirm";
import { isAutoSaveOnExitActive } from "../../data/appSettings";
import { isAutoSaveEligibleFile } from "../../data/autoSaveSession";
import {
  CHECKPOINT_LABELS,
  type CheckpointLabel,
  isManualCheckpointSource,
  resolveCheckpointPolicy,
} from "../../data/checkpointPolicy";
import { executeCheckpointSave } from "../../data/checkpointSaveOrchestrator";
import { installExecutor, requestSaveAndWait } from "../../data/saveQueue";
import {
  clearTabFileDirty,
} from "../../data/tabFileDirtyState";
import { applyRemoteExcalidrawScene } from "./applyRemoteExcalidrawScene";
import { getDocumentSessionVersion } from "../../data/documentSessionVersion";
import { logDocumentVersion } from "../../data/documentVersionLog";
import {
  beginRemoteUpdatePrompt,
  endRemoteUpdatePrompt,
  isRemoteMutationSuppressed,
  isRemoteUpdateTargetSatisfied,
} from "../../data/fileSyncOperationState";

import type {
  SaveToServerOptions,
  SaveToServerSource,
  SceneData,
} from "../../hooks/types";

/** 最近一次服务器保存的结果元信息，供 saveQueue executor 透传给跨页广播 */
type ServerSaveMeta = {
  skipped: boolean;
  contentSha256: string | null;
  version: number | null;
};

const logHook = createLogger({ module: "hook.fileSave" });
const logStash = createLogger({ module: "stash" });
const logHash = createLogger({ module: "hash" });
const logSave = createLogger({ module: "save" });

function getSavedSceneDisplayName(sceneData: SceneData): string {
  const appState = sceneData.appState;
  if (appState && typeof appState === "object" && "name" in appState) {
    const name = (appState as { name?: unknown }).name;
    return typeof name === "string" ? name : "";
  }
  return "";
}

async function resolveSceneForServerSave(
  fileId: string,
  sceneData: SceneData,
): Promise<{ nameForPut: string; sceneForPut: SceneData }> {
  const nameForPut = await resolveSaveDisplayName(fileId);
  return {
    nameForPut,
    sceneForPut: {
      ...sceneData,
      appState: mergeAppStateWithServerFileName(sceneData.appState, nameForPut),
    },
  };
}

export function useForkFileSave(opts: {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  getSceneDataRef: React.MutableRefObject<() => SceneData | null>;
  navigateToFileListHome: () => void;
  setErrorMessage: (msg: string) => void;
  onRequestSaveNew?: (opts: { navigateAfter: boolean }) => void;
  runRemoteSceneApply?: <T>(apply: () => Promise<T>) => Promise<T>;
}) {
  const {
    excalidrawAPI,
    getSceneDataRef,
    navigateToFileListHome,
    setErrorMessage,
    onRequestSaveNew,
    runRemoteSceneApply,
  } = opts;
  const getSceneData = useCallback(
    () => getSceneDataRef.current(),
    [getSceneDataRef],
  );

  const [forkSaving, setForkSaving] = useState(false);
  const [forkSaveHint, setForkSaveHint] = useState<string | null>(null);

  const skipLeaveStashOnceRef = useRef(false);
  const saveToServerRef = useRef<
    (opts?: SaveToServerOptions) => Promise<boolean>
  >(() => Promise.resolve(false));
  const visibilitySaveInFlightRef = useRef(false);
  const localPersistGenRef = useRef(0);
  const lastServerSaveMetaRef = useRef<ServerSaveMeta | null>(null);

  const resolveVersionConflict = useCallback(
    async (args: {
      error: unknown;
      fileId: string;
      sceneData: SceneData;
      source: SaveToServerSource;
      checkpointPolicy?: ReturnType<typeof resolveCheckpointPolicy>;
    }): Promise<PutFileResult | "remote-applied" | "deferred" | null> => {
      if (!isServerSyncVersionConflictError(args.error) || !excalidrawAPI) {
        return null;
      }
      if (args.source === "auto" || args.source === "visibility") {
        setForkSaveHint("服务器已有新版本，已暂停自动覆盖");
        return "deferred";
      }
      const body = getServerSyncErrorJson(args.error) as {
        version?: number;
      } | null;
      const target = {
        fileId: args.fileId,
        contentSha256: null,
        serverVersion: body?.version ?? null,
        source: "save-conflict" as const,
      };
      const token = beginRemoteUpdatePrompt(target);
      try {
        const conflictChoice = await promptServerUpdateConfirm({
          serverVersion: body?.version ?? null,
          mode: "save-conflict",
        });
        if (conflictChoice === "cancel") {
          return null;
        }
        if (conflictChoice === "keep-local") {
          logDocumentVersion({
            action: "conflict-keep-local",
            fileId: args.fileId,
            reason: args.source,
            sessionVersion: getDocumentSessionVersion(args.fileId),
            serverVersion: body?.version ?? null,
          });
          const thumbnail = await generateExcalidrawThumbnailAndCache(
            args.fileId,
            args.sceneData,
          );
          const { nameForPut, sceneForPut } = await resolveSceneForServerSave(
            args.fileId,
            args.sceneData,
          );
          return ServerSync.saveFileImmediate(
            args.fileId,
            sceneForPut,
            nameForPut,
            thumbnail,
            {
              suppressSavedEvent: true,
              checkpointPolicy:
                args.checkpointPolicy ?? resolveCheckpointPolicy(args.source),
              forceOverwrite: true,
              source: args.source,
            },
          );
        }
        localPersistGenRef.current += 1;
        const serverRecord = await ServerSync.getFile(args.fileId, {
          force: true,
        });
        if (
          !isRemoteUpdateTargetSatisfied(target, {
            contentSha256: serverRecord.content_sha256 ?? null,
            version: serverRecord.version ?? null,
          })
        ) {
          setForkSaveHint("服务器版本已再次变化，请重新处理更新");
          return "deferred";
        }
        logDocumentVersion({
          action: "conflict-load-remote",
          fileId: args.fileId,
          reason: args.source,
          sessionVersion: getDocumentSessionVersion(args.fileId),
          serverVersion: serverRecord.version ?? body?.version ?? null,
        });
        const apply = () =>
          applyRemoteExcalidrawScene({
            excalidrawAPI,
            fileId: args.fileId,
            serverFile: serverRecord,
            preserveViewport: true,
          });
        if (runRemoteSceneApply) {
          await runRemoteSceneApply(apply);
        } else {
          await apply();
        }
        excalidrawAPI.setToast({ message: "已载入服务器版本" });
        return "remote-applied";
      } finally {
        endRemoteUpdatePrompt(token);
      }
    },
    [excalidrawAPI, runRemoteSceneApply],
  );

  const updateDraftHashDebouncedRef = useRef(
    debounce((fileId: string, getScene: () => SceneData | null) => {
      if (getFileIdFromHash() !== fileId) {
        return;
      }
      if (isRemoteMutationSuppressed(fileId)) {
        logHash.info("draft hash update suppressed during remote apply", {
          fileId8: fileId.slice(0, 8),
        });
        return;
      }
      const sceneData = getScene();
      if (!sceneData || !fileId) {
        return;
      }
      const draftSceneData = canonicalizeExcalidrawSceneFileName(
        fileId,
        sceneData,
      );
      const state = evaluateCurrentFileModificationState({
        fileId,
        kind: "excalidraw",
        excalidrawScene: draftSceneData,
      });

      applyFileModificationState(fileId, state);
      window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));

      if (!state.modified) {
        localPersistGenRef.current += 1;
        return;
      }

      if (isLocalDraftFileId(fileId)) {
        notifyLocalDraftEdited(fileId);
      }

      const myGen = ++localPersistGenRef.current;
      void (async () => {
        try {
          const deltas = await DeltaStorage.getAllPersistedDtos();
          if (myGen !== localPersistGenRef.current) {
            return;
          }
          if (isRemoteMutationSuppressed(fileId)) {
            logHash.info("local cache write suppressed during remote apply", {
              fileId8: fileId.slice(0, 8),
            });
            return;
          }
          const latest = getScene();
          if (!latest || !fileId) {
            return;
          }
          const canonicalLatest = canonicalizeExcalidrawSceneFileName(
            fileId,
            latest,
          );
          const latestState = evaluateCurrentFileModificationState({
            fileId,
            kind: "excalidraw",
            excalidrawScene: canonicalLatest,
          });
          if (!latestState.modified) {
            return;
          }
          FileSyncState.setServerBackedLocalCache(fileId, {
            elements: canonicalLatest.elements,
            appState: canonicalLatest.appState,
            files: canonicalLatest.files,
            deltas,
          });
          scheduleExcalidrawThumbnailAndCache(fileId, canonicalLatest);
        } catch {
          // quota / idb
        }
      })();
    }, 450),
  );

  useEffect(() => {
    logHook.info("mounted — draft hash debounce active");
    const debounced = updateDraftHashDebouncedRef.current;
    return () => {
      debounced.cancel();
    };
  }, []);

  useEffect(() => {
    if (!forkSaveHint) {
      return;
    }
    const t = window.setTimeout(() => setForkSaveHint(null), 4500);
    return () => window.clearTimeout(t);
  }, [forkSaveHint]);

  const finishNavigateHome = useCallback(() => {
    window.setTimeout(() => {
      skipLeaveStashOnceRef.current = true;
      navigateToFileListHome();
    }, 80);
  }, [navigateToFileListHome]);

  const persistLocalDraftToCache = useCallback(
    async (forcedFileId?: string): Promise<boolean> => {
      const fid = forcedFileId ?? getFileIdFromHash();
      updateDraftHashDebouncedRef.current.flush();
      localPersistGenRef.current += 1;
      if (!fid) {
        logStash.debug("persistLocalDraft skip: no file id");
        return false;
      }
      if (!excalidrawAPI) {
        logStash.debug(`persistLocalDraft skip ${fid.slice(0, 8)}: no api`);
        return false;
      }
      const hasUnsaved = FileSyncState.hasUnsavedChanges(fid);
      logStash.debug(
        `persistLocalDraft enter ${fid.slice(0, 8)} unsaved=${hasUnsaved}`,
      );
      if (!hasUnsaved) {
        logStash.debug(
          `persistLocalDraft skip ${fid.slice(0, 8)}: no unsaved changes`,
        );
        return false;
      }
      const sceneData = getSceneData();
      if (!sceneData) {
        logStash.debug(
          `persistLocalDraft skip ${fid.slice(0, 8)}: no sceneData`,
        );
        return false;
      }
      const deltas = await DeltaStorage.getAllPersistedDtos();
      const canonicalSceneData = canonicalizeExcalidrawSceneFileName(
        fid,
        sceneData,
      );
      FileSyncState.setServerBackedLocalCache(fid, {
        elements: sceneData.elements,
        appState: canonicalSceneData.appState,
        files: sceneData.files,
        deltas,
      });
      const localAfterWrite = FileSyncState.getLocalCache(fid);
      const localAfterWriteElements = Array.isArray(localAfterWrite?.elements)
        ? localAfterWrite.elements.length
        : 0;
      const dh = hashSceneSnapshot(canonicalSceneData);
      FileSyncState.setDraftHash(fid, dh);
      logSave.debug(
        `persistLocalDraft file=${fid.slice(0, 8)}, draftHash=${dh.slice(
          0,
          8,
        )}, elements=${
          sceneData.elements.length
        }, localCacheElements=${localAfterWriteElements}`,
      );
      await generateExcalidrawThumbnailAndCache(fid, sceneData);
      return true;
    },
    [excalidrawAPI, getSceneData],
  );

  const saveCurrentFileToServer = useCallback(
    async (saveOpts?: SaveToServerOptions): Promise<boolean> => {
      const source: SaveToServerSource = saveOpts?.source ?? "toolbar";
      const navigateAfter = saveOpts?.navigateAfter ?? false;
      const fid = getFileIdFromHash();
      if (!excalidrawAPI || !fid) {
        if (navigateAfter) {
          finishNavigateHome();
        }
        return false;
      }
      if (isLocalDraftFileId(fid)) {
        if (source === "auto" || source === "visibility") {
          return false;
        }
        onRequestSaveNew?.({ navigateAfter: !!navigateAfter });
        return false;
      }
      updateDraftHashDebouncedRef.current.flush();
      localPersistGenRef.current += 1;
      const sceneData = getSceneData();
      if (!sceneData) {
        if (navigateAfter) {
          finishNavigateHome();
        }
        return false;
      }
      const canonicalSceneData = canonicalizeExcalidrawSceneFileName(
        fid,
        sceneData,
      );
      const h = hashSceneSnapshot(canonicalSceneData);
      const baseline = FileSyncState.getBaselineHash(fid);
      const unchanged =
        !!baseline && h === baseline && !saveOpts?.forceThumbnail;
      logSave.info("excalidraw save evaluate", {
        fileId8: fid.slice(0, 8),
        source,
        contentHash8: h.slice(0, 8),
        baselineHash8: baseline?.slice(0, 8) ?? null,
        unchanged,
        forceThumbnail: !!saveOpts?.forceThumbnail,
        navigateAfter,
        elements: sceneData.elements.length,
        files: Object.keys(sceneData.files || {}).length,
      });

      if (unchanged) {
        clearTabFileDirty(fid);
      }

      if (!unchanged) {
        if (source !== "visibility" && source !== "auto") {
          setForkSaving(true);
        } else {
          visibilitySaveInFlightRef.current = true;
        }
        if (isManualCheckpointSource(source) || source === "home") {
          setForkSaveHint(null);
        }
      }

      try {
        let outcome: Awaited<ReturnType<typeof executeCheckpointSave>>;
        let savedSceneData: SceneData = canonicalSceneData;
        try {
          outcome = await executeCheckpointSave(
            {
              fileId: fid,
              source,
              contentHash: h,
              baselineHash: baseline,
              forceThumbnail: saveOpts?.forceThumbnail,
              document: canonicalSceneData,
            },
            {
              resolveFileThumbnailForPut: () =>
                generateExcalidrawThumbnailAndCache(fid, sceneData),
              putDocument: async ({ thumbnail, checkpointPolicy }) => {
                const { nameForPut, sceneForPut } =
                  await resolveSceneForServerSave(fid, sceneData);
                savedSceneData = sceneForPut;
                logSave.debug(
                  `saveToServer file=${fid.slice(
                    0,
                    8,
                  )}, name=${nameForPut}, hasThumb=${!!thumbnail}, elements=${
                    sceneData.elements.length
                  }, source=${source}`,
                );
                return ServerSync.saveFileImmediate(
                  fid,
                  sceneForPut,
                  nameForPut,
                  thumbnail,
                  {
                    suppressSavedEvent: true,
                    checkpointPolicy,
                    source,
                  },
                );
              },
            },
          );
        } catch (error) {
          const conflictResult = await resolveVersionConflict({
            error,
            fileId: fid,
            sceneData,
            source,
          });
          if (
            conflictResult === "remote-applied" ||
            conflictResult === "deferred"
          ) {
            return false;
          }
          if (!conflictResult) {
            throw error;
          }
          outcome = {
            saved: true,
            skipped: !!conflictResult.skipped,
            checkpointCreated: !!conflictResult.checkpoint?.created,
            contentSha256: conflictResult.content_sha256 ?? null,
            version: conflictResult.version ?? null,
            updatedAt: conflictResult.updated_at ?? null,
          };
        }

        if (!outcome.saved && !outcome.checkpointCreated) {
          if (isManualCheckpointSource(source)) {
            setForkSaveHint("内容与最新状态一致，无需保存");
          }
          if (navigateAfter) {
            FileSyncState.clearLocalCache(fid);
            finishNavigateHome();
          }
          return false;
        }

        if (outcome.checkpointCreated && unchanged) {
          lastServerSaveMetaRef.current = {
            skipped: false,
            contentSha256: baseline,
            version: outcome.version ?? null,
          };
          window.dispatchEvent(
            new CustomEvent("excalidraw-server-saved", {
              detail: { id: fid, hash: h },
            }),
          );
          if (isManualCheckpointSource(source)) {
            setForkSaveHint("已完成 checkpoint 检查");
          }
          if (navigateAfter) {
            FileSyncState.clearLocalCache(fid);
            finishNavigateHome();
          }
          return true;
        }

        const result = outcome;
        logSave.info("excalidraw save outcome", {
          fileId8: fid.slice(0, 8),
          source,
          saved: outcome.saved,
          skipped: !!outcome.skipped,
          checkpointCreated: !!outcome.checkpointCreated,
          contentSha8: outcome.contentSha256?.slice(0, 8) ?? null,
          version: outcome.version ?? null,
          unchanged,
        });
        logSave.debug(`saveToServer file=${fid.slice(0, 8)}, result`, result);
        const deltasAfterSave = await DeltaStorage.getAllPersistedDtos();
        FileSyncState.setServerSyncedLocalCache(fid, {
          elements: savedSceneData.elements,
          appState: savedSceneData.appState,
          files: savedSceneData.files,
          deltas: deltasAfterSave,
          meta: {
            ...(outcome.contentSha256
              ? { serverContentSha256: outcome.contentSha256 }
              : {}),
            ...(typeof outcome.version === "number"
              ? { serverVersion: outcome.version }
              : {}),
          },
        });

        if (outcome.contentSha256) {
          FileSyncState.setServerHash(fid, outcome.contentSha256);
        }
        updateDraftHashDebouncedRef.current.cancel();
        localPersistGenRef.current += 1;
        lastServerSaveMetaRef.current = {
          skipped: !!outcome.skipped,
          contentSha256: outcome.contentSha256 ?? null,
          version: outcome.version ?? null,
        };
        const hAfter = hashSceneSnapshot(savedSceneData);
        FileSyncState.alignHashes(fid, hAfter);
        FileSyncState.clearLocalEditTime(fid);
        clearTabFileDirty(fid);
        logHash.debug(
          `saveToServer done file=${fid.slice(
            0,
            8,
          )}, baseline=draft=${hAfter.slice(0, 8)}, serverSha=${
            outcome.contentSha256?.slice(0, 8) ?? "none"
          }`,
        );

        logHook.info("save complete", {
          fileId: fid.slice(0, 8),
          source,
          hash: hAfter.slice(0, 8),
        });
        finalizeSavedThumbnail({
          fileId: fid,
          kind: "excalidraw",
          name: getSavedSceneDisplayName(savedSceneData),
          contentSha: outcome.contentSha256,
          version: outcome.version,
          updatedAt: outcome.updatedAt,
          thumbnail: outcome.fileThumbnail,
        });
        window.dispatchEvent(
          new CustomEvent("excalidraw-server-saved", {
            detail: { id: fid, hash: hAfter },
          }),
        );
        window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
        window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
        if (outcome.skipped) {
          if (isManualCheckpointSource(source)) {
            setForkSaveHint("已是最新状态");
          }
        } else if (source === "auto") {
          excalidrawAPI.setToast({ message: "自动保存完成" });
        } else if (source === "visibility") {
          excalidrawAPI.setToast({ message: "切换到后台时已保存到服务器" });
        } else if (isManualCheckpointSource(source)) {
          excalidrawAPI.setToast({ message: "已保存" });
        } else if (source === "home") {
          /* 主页：不单独提示成功，直接返回 */
        }
        if (navigateAfter) {
          FileSyncState.clearLocalCache(fid);
          finishNavigateHome();
        }
        return true;
      } catch (e: any) {
        console.error("[saveCurrentFileToServer]", e);
        if (source === "visibility") {
          /* visibility 静默失败，只打控制台 */
        } else {
          setErrorMessage(e?.message ?? String(e));
        }
        if (navigateAfter) {
          const okLocal = await persistLocalDraftToCache();
          if (okLocal) {
            window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
            window.dispatchEvent(
              new CustomEvent("excalidraw-file-list-refresh"),
            );
            excalidrawAPI.setToast({
              message: "无法上传到服务器，已暂存到本机并返回",
            });
          }
          finishNavigateHome();
        }
        return false;
      } finally {
        if (source !== "visibility" && source !== "auto") {
          setForkSaving(false);
        } else {
          visibilitySaveInFlightRef.current = false;
        }
      }
    },
    [
      excalidrawAPI,
      getSceneData,
      finishNavigateHome,
      onRequestSaveNew,
      persistLocalDraftToCache,
      resolveVersionConflict,
      setErrorMessage,
    ],
  );

  const saveCurrentFileAsCheckpoint = useCallback(
    async (label: CheckpointLabel): Promise<boolean> => {
      const fid = getFileIdFromHash();
      if (!excalidrawAPI || !fid || isLocalDraftFileId(fid)) {
        return false;
      }
      updateDraftHashDebouncedRef.current.flush();
      localPersistGenRef.current += 1;
      const sceneData = getSceneData();
      if (!sceneData) {
        return false;
      }
      try {
        const canonicalSceneData = canonicalizeExcalidrawSceneFileName(
          fid,
          sceneData,
        );
        const h = hashSceneSnapshot(canonicalSceneData);
        const baseline = FileSyncState.getBaselineHash(fid);
        logSave.info("excalidraw archive save evaluate", {
          fileId8: fid.slice(0, 8),
          source: "sidebar",
          label,
          contentHash8: h.slice(0, 8),
          baselineHash8: baseline?.slice(0, 8) ?? null,
          unchanged: !!baseline && h === baseline,
          elements: sceneData.elements.length,
          files: Object.keys(sceneData.files || {}).length,
        });
        let outcome: Awaited<ReturnType<typeof executeCheckpointSave>>;
        let savedSceneData: SceneData = canonicalSceneData;
        const checkpointPolicyOverride = { mode: "force" as const, label };
        try {
          outcome = await executeCheckpointSave(
            {
              fileId: fid,
              source: "sidebar",
              contentHash: h,
              baselineHash: baseline,
              forcePut: true,
              document: canonicalSceneData,
              checkpointPolicyOverride,
            },
            {
              resolveFileThumbnailForPut: () =>
                generateExcalidrawThumbnailAndCache(fid, sceneData),
              putDocument: async ({ thumbnail, checkpointPolicy }) => {
                const { nameForPut, sceneForPut } =
                  await resolveSceneForServerSave(fid, sceneData);
                savedSceneData = sceneForPut;
                return ServerSync.saveFileImmediate(
                  fid,
                  sceneForPut,
                  nameForPut,
                  thumbnail,
                  {
                    suppressSavedEvent: true,
                    checkpointPolicy,
                    source: "sidebar",
                  },
                );
              },
            },
          );
        } catch (error) {
          const conflictResult = await resolveVersionConflict({
            error,
            fileId: fid,
            sceneData,
            source: "sidebar",
            checkpointPolicy: checkpointPolicyOverride,
          });
          if (
            conflictResult === "remote-applied" ||
            conflictResult === "deferred"
          ) {
            return false;
          }
          if (!conflictResult) {
            throw error;
          }
          outcome = {
            saved: true,
            skipped: !!conflictResult.skipped,
            checkpointCreated: !!conflictResult.checkpoint?.created,
            contentSha256: conflictResult.content_sha256 ?? null,
            version: conflictResult.version ?? null,
            updatedAt: conflictResult.updated_at ?? null,
          };
        }
        if (!outcome.saved) {
          return false;
        }
        logSave.info("excalidraw archive save outcome", {
          fileId8: fid.slice(0, 8),
          source: "sidebar",
          label,
          saved: outcome.saved,
          skipped: !!outcome.skipped,
          checkpointCreated: !!outcome.checkpointCreated,
          contentSha8: outcome.contentSha256?.slice(0, 8) ?? null,
          version: outcome.version ?? null,
        });
        const deltasAfterSave = await DeltaStorage.getAllPersistedDtos();
        FileSyncState.setServerSyncedLocalCache(fid, {
          elements: savedSceneData.elements,
          appState: savedSceneData.appState,
          files: savedSceneData.files,
          deltas: deltasAfterSave,
          meta: {
            ...(outcome.contentSha256
              ? { serverContentSha256: outcome.contentSha256 }
              : {}),
            ...(typeof outcome.version === "number"
              ? { serverVersion: outcome.version }
              : {}),
          },
        });
        if (outcome.contentSha256) {
          FileSyncState.setServerHash(fid, outcome.contentSha256);
        }
        updateDraftHashDebouncedRef.current.cancel();
        localPersistGenRef.current += 1;
        const hAfter = hashSceneSnapshot(savedSceneData);
        FileSyncState.alignHashes(fid, hAfter);
        FileSyncState.clearLocalEditTime(fid);
        clearTabFileDirty(fid);
        finalizeSavedThumbnail({
          fileId: fid,
          kind: "excalidraw",
          name: getSavedSceneDisplayName(savedSceneData),
          contentSha: outcome.contentSha256,
          version: outcome.version,
          updatedAt: outcome.updatedAt,
          thumbnail: outcome.fileThumbnail,
        });
        window.dispatchEvent(
          new CustomEvent("excalidraw-server-saved", {
            detail: { id: fid, hash: hAfter },
          }),
        );
        window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
        window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
        return true;
      } catch (e: any) {
        setErrorMessage(e?.message ?? String(e));
        return false;
      }
    },
    [excalidrawAPI, getSceneData, resolveVersionConflict, setErrorMessage],
  );

  const saveAndArchiveCurrentVersion =
    useCallback(async (): Promise<boolean> => {
      const fid = getFileIdFromHash();
      if (!excalidrawAPI || !fid || isLocalDraftFileId(fid)) {
        onRequestSaveNew?.({ navigateAfter: false });
        return false;
      }
      await saveCurrentFileToServer({ source: "sidebar" });
      return saveCurrentFileAsCheckpoint(CHECKPOINT_LABELS.manual);
    }, [
      excalidrawAPI,
      onRequestSaveNew,
      saveCurrentFileAsCheckpoint,
      saveCurrentFileToServer,
    ]);

  useEffect(() => {
    saveToServerRef.current = saveCurrentFileToServer;
  }, [saveCurrentFileToServer]);

  useEffect(() => {
    return installExecutor(
      async (req) => {
        lastServerSaveMetaRef.current = null;
        const result = await saveCurrentFileToServer(req);
        const fid = getFileIdFromHash();
        // 断言绕过 TS 对 await 之后 ref.current 的过度窄化（保存函数内部会写入）
        const meta = lastServerSaveMetaRef.current as ServerSaveMeta | null;
        return {
          saved: result,
          fileId: fid ?? undefined,
          skipped: meta?.skipped,
          contentSha256: meta?.contentSha256,
          version: meta?.version,
        };
      },
      { getCurrentFileId: getFileIdFromHash },
    );
  }, [saveCurrentFileToServer]);

  const discardLocalEditsForHomeNavigation = useCallback(async () => {
    await discardLocalEditsNavigateHome({
      getFileId: () => getFileIdFromHash(),
      flushDraftDebounce: () => updateDraftHashDebouncedRef.current.flush(),
      bumpPersistGeneration: () => {
        localPersistGenRef.current += 1;
      },
      navigateToFileListHome: finishNavigateHome,
    });
  }, [finishNavigateHome]);

  const forkGoHomeWithServerSave = useCallback(async () => {
    const fid = getFileIdFromHash();
    if (!fid) {
      if (shouldDeferLeaveWhileNewDocumentHash(fid)) {
        return;
      }
      navigateToFileListHome();
      return;
    }
    if (!excalidrawAPI) {
      navigateToFileListHome();
      return;
    }
    LocalData.flushSave();
    updateDraftHashDebouncedRef.current.flush();
    const sceneData = getSceneData();
    const state = evaluateCurrentFileModificationState({
      fileId: fid,
      kind: "excalidraw",
      excalidrawScene: sceneData,
    });
    applyFileModificationState(fid, state, {
      clearLocalCacheWhenSynced: true,
    });
    if (isLocalDraftFileId(fid)) {
      if (!state.shouldPromptOnLeave) {
        await discardLocalDraftSession(fid);
        navigateToFileListHome();
        return;
      }
      const leaveChoice = await promptLeaveEditorConfirm({
        isLocalDraft: true,
        contentLabel: "画布",
      });
      if (leaveChoice === "cancel") {
        clearAppShellPendingNavigation();
        return;
      }
      if (leaveChoice === "save") {
        onRequestSaveNew?.({ navigateAfter: true });
        return;
      }
      const confirmed = await promptLocalDraftLossConfirm(
        getLocalDraftDisplayName(fid),
      );
      if (!confirmed) {
        clearAppShellPendingNavigation();
        return;
      }
      await discardLocalDraftSession(fid);
      navigateToFileListHome();
      return;
    }
    if (!state.shouldPromptOnLeave) {
      finishNavigateHome();
      return;
    }
    if (isAutoSaveOnExitActive() && isAutoSaveEligibleFile(fid)) {
      await requestSaveAndWait({ source: "home", navigateAfter: true });
      return;
    }
    const leaveChoice = await promptLeaveEditorConfirm({
      isLocalDraft: false,
      contentLabel: "画布",
    });
    if (leaveChoice === "cancel") {
      clearAppShellPendingNavigation();
      return;
    }
    if (leaveChoice === "save") {
      await requestSaveAndWait({ source: "home", navigateAfter: true });
      return;
    }
    await discardLocalEditsForHomeNavigation();
  }, [
    discardLocalEditsForHomeNavigation,
    excalidrawAPI,
    finishNavigateHome,
    getSceneData,
    navigateToFileListHome,
    onRequestSaveNew,
  ]);

  return {
    forkSaving,
    forkSaveHint,
    saveCurrentFileToServer,
    saveAndArchiveCurrentVersion,
    persistLocalDraftToCache,
    forkGoHomeWithServerSave,
    saveToServerRef,
    visibilitySaveInFlightRef,
    localPersistGenRef,
    updateDraftHashDebouncedRef,
    skipLeaveStashOnceRef,
  };
}
