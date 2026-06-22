import { useCallback, useEffect, useRef, useState } from "react";
import { debounce } from "@excalidraw/common";

import { createLogger } from "../../lib/logger";
import { FileSyncState } from "../../data/FileSyncState";
import { MindMapAdapter } from "../../data/formats/registry";
import { saveMindMapBrowserViewFromData } from "../../data/mindMapBrowserViewStorage";
import { hashDocumentSnapshot } from "../../data/sceneHash";
import {
  getServerSyncErrorJson,
  isServerSyncVersionConflictError,
  ServerSync,
  type PutFileResult,
} from "../../data/ServerSync";
import { getFileIdFromHash } from "../../data/fileIdFromHash";
import {
  shouldDeferLeaveWhileNewDocumentHash,
  shouldPromptEditorHomeNavDialog,
} from "../../data/editorLeaveHome";
import {
  applyFileModificationState,
  evaluateCurrentFileModificationState,
} from "../../data/fileModificationState";

import { isLocalDraftFileId } from "../../data/localDraftFileId";
import { notifyLocalDraftEdited } from "../../data/localDraftSessions";
import { discardLocalDraftSession } from "../../data/discardLocalDraftSession";
import { clearAppShellPendingNavigation } from "../../shell/appShellNavigate";
import {
  promptLeaveEditorConfirm,
  promptLocalDraftLossConfirm,
  promptServerUpdateConfirm,
} from "../../shell/editorLeaveConfirm";
import { getLocalDraftDisplayName } from "../../data/localDraftDisplayName";
import { isAutoSaveEligibleFile, notifyEdit } from "../../data/autoSaveSession";
import {
  CHECKPOINT_LABELS,
  type CheckpointLabel,
  isManualCheckpointSource,
  resolveCheckpointPolicy,
} from "../../data/checkpointPolicy";
import { executeCheckpointSave } from "../../data/checkpointSaveOrchestrator";
import { isAutoSaveOnExitActive } from "../../data/appSettings";
import { installExecutor, requestSaveAndWait } from "../../data/saveQueue";
import {
  clearTabFileDirty,
  markTabFileDirty,
} from "../../data/tabFileDirtyState";
import { patchFileListTreeCacheSavedFile } from "../../data/fileListSessionCache";
import { bindSavedFileThumbnailToContentSha, cacheDraftFileThumbnail } from "../../data/sessionFileThumbnail";
import { LocalThumbnailCache } from "../../data/localThumbnailCache";

import {
  clearMindMapDraftIfUnchanged,
  markMindMapNativeDirtyPending,
} from "./mindMapDraftState";
import { canSkipMindMapNativeSyncOnLeave } from "./mindMapLeaveState";
import { matchesMindMapPersistedSnapshot } from "./mindMapPersistedSnapshot";
import { recordMindMapPersisted } from "./mindMapPersistCoordinator";
import {
  debugMindMapPersist,
  findFirstRichMindMapNodeSummary,
  summarizeMindMapTreeIntegrity,
} from "./mindMapPersistDebug";
import {
  getCachedMindMapServerSha,
  toMindMapLocalCacheRecord,
} from "./mindMapLocalCacheRecord";
import { resolveMindMapSaveDisplayName } from "./mindMapRootNamePolicy";
import { getDocumentSessionVersion } from "../../data/documentSessionVersion";
import { logDocumentVersion } from "../../data/documentVersionLog";
import {
  beginRemoteUpdatePrompt,
  endRemoteUpdatePrompt,
  type RemoteUpdateTarget,
} from "../../data/fileSyncOperationState";

import type { ManagedDocument } from "../../data/documentTypes";
import type { MindMapDocumentData } from "../../data/formats/MindMapAdapter";
import type {
  SaveToServerOptions,
  SaveToServerSource,
} from "../../hooks/types";

export { getCachedMindMapServerSha, toMindMapLocalCacheRecord };

const logSave = createLogger({ module: "save" });

type MindMapSaveDocument = ManagedDocument<MindMapDocumentData>;

export type MindMapNativeSaveResult = {
  document: MindMapSaveDocument;
  thumbnail?: string | null;
};

type RequestNativeMindMapData = () => Promise<MindMapNativeSaveResult | null>;

/** 最近一次服务器保存的结果元信息，供 saveQueue executor 透传给跨页广播 */
type ServerSaveMeta = {
  skipped: boolean;
  contentSha256: string | null;
  version: number | null;
};

const MINDMAP_SAVE_TIMEOUT_MS = 15_000;

function isSilentSaveSource(source: SaveToServerSource): boolean {
  return source === "auto" || source === "visibility" || source === "thumbnail";
}

export function shouldSkipMindMapThumbnailServerSave(opts: {
  source: SaveToServerSource;
  contentHash: string;
  baselineHash: string | null;
}): boolean {
  return opts.source === "thumbnail" && opts.contentHash !== opts.baselineHash;
}

function legacyMindMapCacheKey(fileId: string): string {
  return `mindmap-local-cache-${fileId}`;
}

function normalizeMindMapSaveDocument(
  document: MindMapSaveDocument,
): MindMapSaveDocument {
  return MindMapAdapter.toDocument(MindMapAdapter.migrate(document, 1));
}

export function getCachedMindMapDocument(
  fileId: string,
): MindMapSaveDocument | null {
  const localCache = FileSyncState.getLocalCache(fileId);
  if (localCache?.document?.kind === "mindmap") {
    saveMindMapBrowserViewFromData(fileId, localCache.document.data);
    const document = normalizeMindMapSaveDocument(
      localCache.document as MindMapSaveDocument,
    );
    const cachedServerSha = localCache.meta?.serverContentSha256;
    const cachedServerVersion = localCache.meta?.serverVersion;
    FileSyncState.setServerSyncedLocalCache(
      fileId,
      toMindMapLocalCacheRecord(document, cachedServerSha, cachedServerVersion),
    );
    return document;
  }
  try {
    const legacy = localStorage.getItem(legacyMindMapCacheKey(fileId));
    if (!legacy) {
      return null;
    }
    const parsed = JSON.parse(legacy);
    saveMindMapBrowserViewFromData(
      fileId,
      parsed?.kind === "mindmap" ? parsed.data : parsed,
    );
    const document = MindMapAdapter.toDocument(
      MindMapAdapter.migrate(parsed, 1),
    );
    FileSyncState.setServerBackedLocalCache(
      fileId,
      toMindMapLocalCacheRecord(document),
    );
    localStorage.removeItem(legacyMindMapCacheKey(fileId));
    return document;
  } catch {
    return null;
  }
}

export function useMindMapFileSave(opts: {
  getCurrentDocument: () => MindMapSaveDocument | null;
  requestNativeMindMapData: RequestNativeMindMapData;
  getFileName: () => string;
  navigateToFileListHome: () => void;
  setErrorMessage: (msg: string | null) => void;
  setStatus: (msg: string) => void;
  onRequestSaveNew?: (opts: { navigateAfter: boolean }) => void;
  applyRemoteServerVersion?: (target?: RemoteUpdateTarget) => Promise<void>;
}) {
  const {
    getCurrentDocument,
    requestNativeMindMapData,
    getFileName,
    navigateToFileListHome,
    setErrorMessage,
    setStatus,
    onRequestSaveNew,
    applyRemoteServerVersion,
  } = opts;

  const [mindMapSaving, setMindMapSaving] = useState(false);
  const [mindMapSaveHint, setMindMapSaveHint] = useState<string | null>(null);

  const skipLeaveStashOnceRef = useRef(false);
  const visibilitySaveInFlightRef = useRef(false);
  const saveToServerRef = useRef<
    (saveOpts?: SaveToServerOptions) => Promise<boolean>
  >(() => Promise.resolve(false));
  const lastServerSaveMetaRef = useRef<ServerSaveMeta | null>(null);

  const resolveVersionConflict = useCallback(
    async (args: {
      error: unknown;
      fileId: string;
      document: MindMapSaveDocument;
      displayName: string;
      thumbnail?: string | null;
      source: SaveToServerSource;
      checkpointPolicy?: ReturnType<typeof resolveCheckpointPolicy>;
    }): Promise<PutFileResult | "remote-applied" | "deferred" | null> => {
      if (!isServerSyncVersionConflictError(args.error)) {
        return null;
      }
      if (isSilentSaveSource(args.source)) {
        setMindMapSaveHint("服务器已有新版本，已暂停自动覆盖");
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
          documentName: args.displayName,
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
          return ServerSync.saveFileImmediate(
            args.fileId,
            args.document,
            args.displayName,
            args.thumbnail,
            {
              suppressSavedEvent: true,
              checkpointPolicy:
                args.checkpointPolicy ?? resolveCheckpointPolicy(args.source),
              forceOverwrite: true,
              source: args.source,
            },
          );
        }
        logDocumentVersion({
          action: "conflict-load-remote",
          fileId: args.fileId,
          reason: args.source,
          sessionVersion: getDocumentSessionVersion(args.fileId),
          serverVersion: body?.version ?? null,
        });
        if (applyRemoteServerVersion) {
          await applyRemoteServerVersion(target);
        }
        setStatus("已载入服务器版本");
        return "remote-applied";
      } finally {
        endRemoteUpdatePrompt(token);
      }
    },
    [applyRemoteServerVersion, setStatus],
  );

  const updateDraftHashDebouncedRef = useRef(
    debounce(
      (fileId: string, getDocument: () => MindMapSaveDocument | null) => {
        if (getFileIdFromHash() !== fileId) {
          debugMindMapPersist("draftHashDebounced skip: fileId mismatch", {
            fileId8: fileId.slice(0, 8),
            currentFileId8: getFileIdFromHash()?.slice(0, 8) ?? null,
          });
          return;
        }
        const document = getDocument();
        if (!document) {
          debugMindMapPersist("draftHashDebounced skip: no document", {
            fileId8: fileId.slice(0, 8),
          });
          return;
        }
        const state = evaluateCurrentFileModificationState({
          fileId,
          kind: "mindmap",
          mindMapDocument: document,
        });
        const hash = state.modified
          ? state.contentHash ?? hashDocumentSnapshot(document)
          : state.baselineHash ??
            state.contentHash ??
            hashDocumentSnapshot(document);

        debugMindMapPersist("draftHashDebounced write", {
          fileId8: fileId.slice(0, 8),
          modified: state.modified,
          hash8: hash.slice(0, 8),
          baselineHash8: state.baselineHash?.slice(0, 8) ?? null,
          wroteLocalCache: state.modified,
          sampleNode: findFirstRichMindMapNodeSummary(document.data),
        });
        if (state.modified) {
          FileSyncState.setServerBackedLocalCache(
            fileId,
            toMindMapLocalCacheRecord(document),
          );
        }
        applyFileModificationState(fileId, state);
        if (!state.modified) {
          return;
        }
        if (isLocalDraftFileId(fileId)) {
          notifyLocalDraftEdited(fileId);
        }
      },
      450,
    ),
  );

  useEffect(() => {
    const debounced = updateDraftHashDebouncedRef.current;
    return () => {
      debounced.cancel();
    };
  }, []);

  useEffect(() => {
    if (!mindMapSaveHint) {
      return;
    }
    const timer = window.setTimeout(() => setMindMapSaveHint(null), 4500);
    return () => window.clearTimeout(timer);
  }, [mindMapSaveHint]);

  const finishNavigateHome = useCallback(() => {
    window.setTimeout(() => {
      skipLeaveStashOnceRef.current = true;
      navigateToFileListHome();
    }, 80);
  }, [navigateToFileListHome]);

  const markDocumentChanged = useCallback(
    (document: MindMapSaveDocument) => {
      const fileId = getFileIdFromHash();
      if (!fileId) {
        return;
      }
      if (matchesMindMapPersistedSnapshot(fileId, document)) {
        debugMindMapPersist(
          "markDocumentChanged branch: matches-persisted-snapshot",
          {
            fileId8: fileId.slice(0, 8),
            contentHash8: hashDocumentSnapshot(document).slice(0, 8),
          },
        );
        updateDraftHashDebouncedRef.current.cancel();
        clearTabFileDirty(fileId);
        FileSyncState.alignHashes(fileId, hashDocumentSnapshot(document));
        FileSyncState.clearLocalEditTime(fileId);
        setStatus("");
        return;
      }
      if (clearMindMapDraftIfUnchanged(fileId, document)) {
        debugMindMapPersist(
          "markDocumentChanged branch: unchanged-vs-baseline",
          {
            fileId8: fileId.slice(0, 8),
            contentHash8: hashDocumentSnapshot(document).slice(0, 8),
          },
        );
        clearTabFileDirty(fileId);
        setStatus("");
        return;
      }
      markTabFileDirty(fileId);
      debugMindMapPersist(
        "markDocumentChanged branch: mark-draft (debounce 450ms)",
        {
          fileId8: fileId.slice(0, 8),
          contentHash8: hashDocumentSnapshot(document).slice(0, 8),
          baselineHash8:
            FileSyncState.getBaselineHash(fileId)?.slice(0, 8) ?? null,
          sampleNode: findFirstRichMindMapNodeSummary(document.data),
        },
      );
      updateDraftHashDebouncedRef.current(fileId, () => document);
      notifyEdit();
      setStatus("有未保存更改");
    },
    [setStatus],
  );

  const markNativeDocumentDirty = useCallback(() => {
    const fileId = getFileIdFromHash();
    if (!fileId) {
      setStatus("有未保存更改");
      notifyEdit();
      return;
    }
    markTabFileDirty(fileId);
    const marked = markMindMapNativeDirtyPending(fileId);
    debugMindMapPersist("markNativeDocumentDirty", {
      fileId8: fileId.slice(0, 8),
      markedPending: marked,
      draftHash8: FileSyncState.getDraftHash(fileId)?.slice(0, 16) ?? null,
      baselineHash8: FileSyncState.getBaselineHash(fileId)?.slice(0, 8) ?? null,
    });
    notifyEdit();
    setStatus("有未保存更改");
    if (isLocalDraftFileId(fileId)) {
      notifyLocalDraftEdited(fileId);
    }
  }, [setStatus]);

  const persistLocalDraftToCache = useCallback(
    async (forcedFileId?: string): Promise<boolean> => {
      const fileId = forcedFileId ?? getFileIdFromHash();
      updateDraftHashDebouncedRef.current.flush();
      if (!fileId) {
        return false;
      }
      const hadUnsaved = FileSyncState.hasUnsavedChanges(fileId);
      debugMindMapPersist("persistLocalDraftToCache start", {
        fileId8: fileId.slice(0, 8),
        hadUnsaved,
        draftHash16: FileSyncState.getDraftHash(fileId)?.slice(0, 16) ?? null,
      });
      const nativeSave = hadUnsaved ? await requestNativeMindMapData() : null;
      const document = nativeSave?.document ?? getCurrentDocument();
      debugMindMapPersist("persistLocalDraftToCache native result", {
        fileId8: fileId.slice(0, 8),
        nativeSaveOk: !!nativeSave,
        usedFallbackDocument: !nativeSave && !!document,
        hasDocument: !!document,
        stillUnsaved: FileSyncState.hasUnsavedChanges(fileId),
      });
      if (!document || !FileSyncState.hasUnsavedChanges(fileId)) {
        return false;
      }
      FileSyncState.setServerBackedLocalCache(
        fileId,
        toMindMapLocalCacheRecord(document),
      );
      FileSyncState.setDraftHash(fileId, hashDocumentSnapshot(document));
      debugMindMapPersist("persistLocalDraftToCache wrote cache", {
        fileId8: fileId.slice(0, 8),
        hash8: hashDocumentSnapshot(document).slice(0, 8),
        sampleNode: findFirstRichMindMapNodeSummary(document.data),
      });
      return true;
    },
    [getCurrentDocument, requestNativeMindMapData],
  );

  const saveCurrentFileToServer = useCallback(
    async (saveOpts?: SaveToServerOptions): Promise<boolean> => {
      const source: SaveToServerSource = saveOpts?.source ?? "toolbar";
      const navigateAfter = saveOpts?.navigateAfter ?? false;
      const forceThumbnail = saveOpts?.forceThumbnail ?? false;
      const fileId = getFileIdFromHash();
      if (!fileId) {
        if (navigateAfter) {
          finishNavigateHome();
        }
        return false;
      }
      if (isLocalDraftFileId(fileId)) {
        if (isSilentSaveSource(source)) {
          return false;
        }
        onRequestSaveNew?.({ navigateAfter: !!navigateAfter });
        return false;
      }

      updateDraftHashDebouncedRef.current.flush();

      const nativeSave = await requestNativeMindMapData();
      if (!nativeSave) {
        logSave.event("warn", "mindmap.save.native-empty", "native save returned null", {
          fields: {
            fileId8: fileId.slice(0, 8),
            source,
            navigateAfter,
          },
        });
        if (navigateAfter) {
          finishNavigateHome();
        }
        return false;
      }
      const { document, thumbnail } = nativeSave;
      const displayName = resolveMindMapSaveDisplayName(
        document.data,
        getFileName(),
      );

      const hash = hashDocumentSnapshot(document);
      const baseline = FileSyncState.getBaselineHash(fileId);
      const unchanged = !!baseline && hash === baseline && !forceThumbnail;
      logSave.info("mindmap save evaluate", {
        fileId8: fileId.slice(0, 8),
        source,
        contentHash8: hash.slice(0, 8),
        baselineHash8: baseline?.slice(0, 8) ?? null,
        unchanged,
        forceThumbnail,
        navigateAfter,
        hasThumbnail: typeof thumbnail === "string" && thumbnail.length > 0,
        sampleNode: findFirstRichMindMapNodeSummary(document.data),
      });

      if (
        shouldSkipMindMapThumbnailServerSave({
          source,
          contentHash: hash,
          baselineHash: baseline,
        })
      ) {
        const state = evaluateCurrentFileModificationState({
          fileId,
          kind: "mindmap",
          mindMapDocument: document,
        });
        if (state.modified) {
          FileSyncState.setServerBackedLocalCache(
            fileId,
            toMindMapLocalCacheRecord(document),
          );
          applyFileModificationState(fileId, state);
          if (thumbnail) {
            cacheDraftFileThumbnail(fileId, thumbnail, hash);
          }
        }
        logSave.info("mindmap thumbnail save skipped", {
          fileId8: fileId.slice(0, 8),
          source,
          contentHash8: hash.slice(0, 8),
          baselineHash8: baseline?.slice(0, 8) ?? null,
          modified: state.modified,
          stateContentHash8: state.contentHash?.slice(0, 8) ?? null,
          stateBaselineHash8: state.baselineHash?.slice(0, 8) ?? null,
        });
        debugMindMapPersist("thumbnail save skipped for dirty document", {
          fileId8: fileId.slice(0, 8),
          contentHash8: hash.slice(0, 8),
          baselineHash8: baseline?.slice(0, 8) ?? null,
          modified: state.modified,
        });
        return false;
      }

      debugMindMapPersist("saveCurrentFileToServer start", {
        fileId8: fileId.slice(0, 8),
        source,
        contentHash8: hash.slice(0, 8),
        baselineHash8: baseline?.slice(0, 8) ?? null,
        integrity: summarizeMindMapTreeIntegrity(document.data),
        sampleNode: findFirstRichMindMapNodeSummary(document.data),
      });

      if (unchanged) {
        clearTabFileDirty(fileId);
      }

      if (!unchanged) {
        if (!isSilentSaveSource(source)) {
          setMindMapSaving(true);
          setMindMapSaveHint(null);
        } else {
          visibilitySaveInFlightRef.current = true;
        }
      }

      try {
        let outcome: Awaited<ReturnType<typeof executeCheckpointSave>>;
        try {
          outcome = await executeCheckpointSave(
            {
              fileId,
              source,
              contentHash: hash,
              baselineHash: baseline,
              forceThumbnail,
              document,
            },
            {
              resolveFileThumbnailForPut: async () =>
                thumbnail ?? LocalThumbnailCache.get(fileId) ?? undefined,
              putDocument: async ({
                thumbnail: thumbForPut,
                checkpointPolicy,
              }) =>
                ServerSync.saveFileImmediate(
                  fileId,
                  document,
                  displayName,
                  thumbForPut,
                  {
                    suppressSavedEvent: true,
                    checkpointPolicy,
                    source,
                  },
                ),
            },
          );
        } catch (error) {
          const conflictResult = await resolveVersionConflict({
            error,
            fileId,
            document,
            displayName,
            thumbnail,
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
            setMindMapSaveHint("内容与最新状态一致，无需保存");
            setStatus("已保存");
          }
          if (navigateAfter) {
            FileSyncState.clearLocalCache(fileId);
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
              detail: { id: fileId, hash },
            }),
          );
          if (isManualCheckpointSource(source)) {
            setMindMapSaveHint("已完成 checkpoint 检查");
            setStatus("已保存");
          }
          if (navigateAfter) {
            FileSyncState.clearLocalCache(fileId);
            finishNavigateHome();
          }
          return true;
        }

        updateDraftHashDebouncedRef.current.cancel();
        logSave.info("mindmap save outcome", {
          fileId8: fileId.slice(0, 8),
          source,
          saved: outcome.saved,
          skipped: !!outcome.skipped,
          checkpointCreated: !!outcome.checkpointCreated,
          contentSha8: outcome.contentSha256?.slice(0, 8) ?? null,
          version: outcome.version ?? null,
          unchanged,
        });
        lastServerSaveMetaRef.current = {
          skipped: !!outcome.skipped,
          contentSha256: outcome.contentSha256 ?? null,
          version: outcome.version ?? null,
        };
        recordMindMapPersisted(fileId, document, {
          serverContentSha256: outcome.contentSha256 ?? undefined,
          serverVersion: outcome.version ?? undefined,
        });
        const savedThumbnail = bindSavedFileThumbnailToContentSha(
          fileId,
          outcome.contentSha256,
          thumbnail ?? outcome.fileThumbnail,
        );
        patchFileListTreeCacheSavedFile(fileId, {
          name: displayName,
          kind: "mindmap",
          has_thumbnail: savedThumbnail ? true : undefined,
          content_sha256: outcome.contentSha256 ?? undefined,
          version: outcome.version ?? undefined,
          updated_at: outcome.updatedAt ?? undefined,
        });
        debugMindMapPersist("saveCurrentFileToServer success", {
          fileId8: fileId.slice(0, 8),
          source,
          skipped: !!outcome.skipped,
          serverSha8: outcome.contentSha256?.slice(0, 8) ?? null,
        });
        localStorage.removeItem(legacyMindMapCacheKey(fileId));
        window.dispatchEvent(
          new CustomEvent("excalidraw-server-saved", {
            detail: { id: fileId, hash },
          }),
        );
        window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
        if (!navigateAfter) {
          window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
        }
        if (source === "auto") {
          setMindMapSaveHint("自动保存完成");
        } else if (isManualCheckpointSource(source)) {
          setMindMapSaveHint(outcome.skipped ? "已是最新状态" : "已保存");
        }
        setStatus("已保存");
        setErrorMessage(null);
        if (navigateAfter) {
          FileSyncState.clearLocalCache(fileId);
          finishNavigateHome();
        }
        return true;
      } catch (err: any) {
        debugMindMapPersist("saveCurrentFileToServer failed", {
          fileId8: fileId.slice(0, 8),
          source,
          message: err?.message || String(err),
        });
        if (source !== "visibility" && source !== "thumbnail") {
          setErrorMessage(err?.message || "保存失败");
        }
        if (navigateAfter) {
          const okLocal = await persistLocalDraftToCache(fileId);
          if (okLocal) {
            window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
            window.dispatchEvent(
              new CustomEvent("excalidraw-file-list-refresh"),
            );
            setMindMapSaveHint("无法上传到服务器，已暂存到本机并返回");
          }
          finishNavigateHome();
        }
        return false;
      } finally {
        if (!isSilentSaveSource(source)) {
          setMindMapSaving(false);
        } else {
          visibilitySaveInFlightRef.current = false;
        }
      }
    },
    [
      finishNavigateHome,
      getFileName,
      onRequestSaveNew,
      persistLocalDraftToCache,
      requestNativeMindMapData,
      resolveVersionConflict,
      setErrorMessage,
      setStatus,
    ],
  );

  const saveCurrentFileAsCheckpoint = useCallback(
    async (
      label: CheckpointLabel,
      nativeSaveOverride?: MindMapNativeSaveResult,
    ): Promise<boolean> => {
      const fileId = getFileIdFromHash();
      if (!fileId || isLocalDraftFileId(fileId)) {
        return false;
      }
      updateDraftHashDebouncedRef.current.flush();
      const nativeSave =
        nativeSaveOverride ?? (await requestNativeMindMapData());
      if (!nativeSave) {
        return false;
      }
      const { document, thumbnail } = nativeSave;
      const displayName = resolveMindMapSaveDisplayName(
        document.data,
        getFileName(),
      );
      const hash = hashDocumentSnapshot(document);
      const baseline = FileSyncState.getBaselineHash(fileId);
      logSave.info("mindmap archive save evaluate", {
        fileId8: fileId.slice(0, 8),
        source: "sidebar",
        label,
        contentHash8: hash.slice(0, 8),
        baselineHash8: baseline?.slice(0, 8) ?? null,
        unchanged: !!baseline && hash === baseline,
        hasThumbnail: typeof thumbnail === "string" && thumbnail.length > 0,
        sampleNode: findFirstRichMindMapNodeSummary(document.data),
      });
      try {
        let outcome: Awaited<ReturnType<typeof executeCheckpointSave>>;
        const checkpointPolicyOverride = { mode: "force" as const, label };
        try {
          outcome = await executeCheckpointSave(
            {
              fileId,
              source: "sidebar",
              contentHash: hash,
              baselineHash: baseline,
              forcePut: true,
              document,
              checkpointPolicyOverride,
            },
            {
              resolveFileThumbnailForPut: async () =>
                thumbnail ?? LocalThumbnailCache.get(fileId) ?? undefined,
              putDocument: async ({
                thumbnail: thumbForPut,
                checkpointPolicy,
              }) =>
                ServerSync.saveFileImmediate(
                  fileId,
                  document,
                  displayName,
                  thumbForPut,
                  {
                    suppressSavedEvent: true,
                    checkpointPolicy,
                    source: "sidebar",
                  },
                ),
            },
          );
        } catch (error) {
          const conflictResult = await resolveVersionConflict({
            error,
            fileId,
            document,
            displayName,
            thumbnail,
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
        logSave.info("mindmap archive save outcome", {
          fileId8: fileId.slice(0, 8),
          source: "sidebar",
          label,
          saved: outcome.saved,
          skipped: !!outcome.skipped,
          checkpointCreated: !!outcome.checkpointCreated,
          contentSha8: outcome.contentSha256?.slice(0, 8) ?? null,
          version: outcome.version ?? null,
        });
        updateDraftHashDebouncedRef.current.cancel();
        recordMindMapPersisted(fileId, document, {
          serverContentSha256: outcome.contentSha256 ?? undefined,
          serverVersion: outcome.version ?? undefined,
        });
        const savedThumbnail = bindSavedFileThumbnailToContentSha(
          fileId,
          outcome.contentSha256,
          thumbnail ?? outcome.fileThumbnail,
        );
        patchFileListTreeCacheSavedFile(fileId, {
          name: displayName,
          kind: "mindmap",
          has_thumbnail: savedThumbnail ? true : undefined,
          content_sha256: outcome.contentSha256 ?? undefined,
          version: outcome.version ?? undefined,
          updated_at: outcome.updatedAt ?? undefined,
        });
        localStorage.removeItem(legacyMindMapCacheKey(fileId));
        window.dispatchEvent(
          new CustomEvent("excalidraw-server-saved", {
            detail: { id: fileId, hash },
          }),
        );
        window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
        window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
        setStatus("已保存");
        setErrorMessage(null);
        return true;
      } catch (err: any) {
        setErrorMessage(err?.message || "创建存档失败");
        return false;
      }
    },
    [
      getFileName,
      requestNativeMindMapData,
      resolveVersionConflict,
      setErrorMessage,
      setStatus,
    ],
  );

  const saveAndArchiveCurrentVersion =
    useCallback(async (): Promise<boolean> => {
      const fileId = getFileIdFromHash();
      if (!fileId || isLocalDraftFileId(fileId)) {
        onRequestSaveNew?.({ navigateAfter: false });
        return false;
      }
      await saveCurrentFileToServer({ source: "sidebar" });
      return saveCurrentFileAsCheckpoint(CHECKPOINT_LABELS.manual);
    }, [
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

  const syncCurrentMindMapDraftForLeave = useCallback(
    async (fileId: string) => {
      const nativeSave = await requestNativeMindMapData();
      if (!nativeSave) {
        debugMindMapPersist("syncDraftForLeave: native save failed/timeout", {
          fileId8: fileId.slice(0, 8),
          draftHash16: FileSyncState.getDraftHash(fileId)?.slice(0, 16) ?? null,
        });
        updateDraftHashDebouncedRef.current.flush();
        return;
      }
      const { document } = nativeSave;
      updateDraftHashDebouncedRef.current.flush();
      const state = evaluateCurrentFileModificationState({
        fileId,
        kind: "mindmap",
        mindMapDocument: document,
      });
      const hash = state.modified
        ? state.contentHash ?? hashDocumentSnapshot(document)
        : state.baselineHash ??
          state.contentHash ??
          hashDocumentSnapshot(document);
      debugMindMapPersist("syncDraftForLeave result", {
        fileId8: fileId.slice(0, 8),
        modified: state.modified,
        hash8: hash.slice(0, 8),
        baselineHash8: state.baselineHash?.slice(0, 8) ?? null,
        sampleNode: findFirstRichMindMapNodeSummary(document.data),
      });
      applyFileModificationState(fileId, state, {
        clearLocalCacheWhenSynced: true,
      });
      if (!state.modified) {
        return;
      }
      FileSyncState.setServerBackedLocalCache(
        fileId,
        toMindMapLocalCacheRecord(document),
      );
      if (isLocalDraftFileId(fileId)) {
        notifyLocalDraftEdited(fileId);
      }
    },
    [requestNativeMindMapData],
  );

  const discardMindMapEditsForHomeNavigation = useCallback(async () => {
    const fileId = getFileIdFromHash();
    updateDraftHashDebouncedRef.current.flush();
    if (fileId) {
      FileSyncState.clearLocalCache(fileId);
      const baseline = FileSyncState.getBaselineHash(fileId);
      if (baseline) {
        FileSyncState.setDraftHash(fileId, baseline);
      } else {
        FileSyncState.clearDraftHash(fileId);
        FileSyncState.clearBaselineHash(fileId);
      }
      FileSyncState.clearLocalEditTime(fileId);
      localStorage.removeItem(legacyMindMapCacheKey(fileId));
      window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
      window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
    }
    finishNavigateHome();
  }, [finishNavigateHome]);

  const mindMapGoHomeWithServerSave = useCallback(async () => {
    const fileId = getFileIdFromHash();
    if (!fileId) {
      if (shouldDeferLeaveWhileNewDocumentHash(fileId)) {
        return;
      }
      navigateToFileListHome();
      return;
    }
    if (isLocalDraftFileId(fileId)) {
      await syncCurrentMindMapDraftForLeave(fileId);
      if (!shouldPromptEditorHomeNavDialog(fileId)) {
        await discardLocalDraftSession(fileId);
        navigateToFileListHome();
        return;
      }
      const leaveChoice = await promptLeaveEditorConfirm({
        isLocalDraft: true,
        contentLabel: "mindmap",
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
        getLocalDraftDisplayName(fileId),
      );
      if (!confirmed) {
        clearAppShellPendingNavigation();
        return;
      }
      await discardLocalDraftSession(fileId);
      navigateToFileListHome();
      return;
    }
    if (canSkipMindMapNativeSyncOnLeave(fileId)) {
      debugMindMapPersist("goHome skip native sync: already clean", {
        fileId8: fileId.slice(0, 8),
        draftHash16: FileSyncState.getDraftHash(fileId)?.slice(0, 16) ?? null,
        baselineHash8:
          FileSyncState.getBaselineHash(fileId)?.slice(0, 8) ?? null,
      });
      finishNavigateHome();
      return;
    }
    await syncCurrentMindMapDraftForLeave(fileId);
    const promptNeeded = shouldPromptEditorHomeNavDialog(fileId);
    const autoSaveExit =
      isAutoSaveOnExitActive() && isAutoSaveEligibleFile(fileId);
    debugMindMapPersist("goHome decision", {
      fileId8: fileId.slice(0, 8),
      promptNeeded,
      autoSaveExit,
      draftHash16: FileSyncState.getDraftHash(fileId)?.slice(0, 16) ?? null,
      baselineHash8: FileSyncState.getBaselineHash(fileId)?.slice(0, 8) ?? null,
    });
    if (!promptNeeded) {
      finishNavigateHome();
      return;
    }
    if (autoSaveExit) {
      await requestSaveAndWait({ source: "home", navigateAfter: true });
      return;
    }
    const leaveChoice = await promptLeaveEditorConfirm({
      isLocalDraft: false,
      contentLabel: "mindmap",
    });
    if (leaveChoice === "cancel") {
      clearAppShellPendingNavigation();
      return;
    }
    if (leaveChoice === "save") {
      await requestSaveAndWait({ source: "home", navigateAfter: true });
      return;
    }
    await discardMindMapEditsForHomeNavigation();
  }, [
    discardMindMapEditsForHomeNavigation,
    finishNavigateHome,
    navigateToFileListHome,
    onRequestSaveNew,
    syncCurrentMindMapDraftForLeave,
  ]);

  return {
    mindMapSaving,
    mindMapSaveHint,
    markDocumentChanged,
    markNativeDocumentDirty,
    persistLocalDraftToCache,
    saveCurrentFileToServer,
    saveAndArchiveCurrentVersion,
    mindMapGoHomeWithServerSave,
    saveToServerRef,
    visibilitySaveInFlightRef,
    updateDraftHashDebouncedRef,
    skipLeaveStashOnceRef,
  };
}

export { MINDMAP_SAVE_TIMEOUT_MS };
