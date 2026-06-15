import { useCallback, useEffect, useRef, useState } from "react";
import { debounce } from "@excalidraw/common";

import { FileSyncState } from "../../data/FileSyncState";
import { MindMapAdapter } from "../../data/formats/registry";
import { saveMindMapBrowserViewFromData } from "../../data/mindMapBrowserViewStorage";
import { hashDocumentSnapshot } from "../../data/sceneHash";
import { ServerSync } from "../../data/ServerSync";
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
  isAutoSaveEligibleFile,
  notifyEdit,
  resolveAutoSaveArchiveLabel,
} from "../../data/autoSaveSession";
import { isAutoSaveOnExitActive } from "../../data/appSettings";
import { installExecutor, requestSaveAndWait } from "../../data/saveQueue";
import {
  clearTabFileDirty,
  markTabFileDirty,
} from "../../data/tabFileDirtyState";

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
} from "./mindMapPersistDebug";
import {
  getCachedMindMapServerSha,
  toMindMapLocalCacheRecord,
} from "./mindMapLocalCacheRecord";

import type { ManagedDocument } from "../../data/documentTypes";
import type { MindMapDocumentData } from "../../data/formats/MindMapAdapter";
import type {
  SaveToServerOptions,
  SaveToServerSource,
} from "../../hooks/types";

export { getCachedMindMapServerSha, toMindMapLocalCacheRecord };

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
};

const MINDMAP_SAVE_TIMEOUT_MS = 8000;

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
    FileSyncState.setLocalCache(
      fileId,
      toMindMapLocalCacheRecord(document, cachedServerSha),
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
    FileSyncState.setLocalCache(fileId, toMindMapLocalCacheRecord(document));
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
}) {
  const {
    getCurrentDocument,
    requestNativeMindMapData,
    getFileName,
    navigateToFileListHome,
    setErrorMessage,
    setStatus,
    onRequestSaveNew,
  } = opts;

  const [mindMapSaving, setMindMapSaving] = useState(false);
  const [mindMapSaveHint, setMindMapSaveHint] = useState<string | null>(null);
  const [mindMapHomeNavDialogOpen, setMindMapHomeNavDialogOpen] =
    useState(false);

  const skipLeaveStashOnceRef = useRef(false);
  const visibilitySaveInFlightRef = useRef(false);
  const saveToServerRef = useRef<
    (saveOpts?: SaveToServerOptions) => Promise<boolean>
  >(() => Promise.resolve(false));
  const lastServerSaveMetaRef = useRef<ServerSaveMeta | null>(null);

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
          FileSyncState.setLocalCache(
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
      FileSyncState.setLocalCache(fileId, toMindMapLocalCacheRecord(document));
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
        if (source === "auto" || source === "visibility") {
          return false;
        }
        onRequestSaveNew?.({ navigateAfter: !!navigateAfter });
        return false;
      }

      updateDraftHashDebouncedRef.current.flush();

      const nativeSave = await requestNativeMindMapData();
      if (!nativeSave) {
        if (navigateAfter) {
          finishNavigateHome();
        }
        return false;
      }
      const { document, thumbnail } = nativeSave;

      const hash = hashDocumentSnapshot(document);
      const baseline = FileSyncState.getBaselineHash(fileId);
      const contentChanged = !baseline || hash !== baseline;
      debugMindMapPersist("saveCurrentFileToServer start", {
        fileId8: fileId.slice(0, 8),
        source,
        contentHash8: hash.slice(0, 8),
        baselineHash8: baseline?.slice(0, 8) ?? null,
        sampleNode: findFirstRichMindMapNodeSummary(document.data),
      });
      if (baseline && hash === baseline && !forceThumbnail) {
        debugMindMapPersist("saveCurrentFileToServer skipped: baseline match", {
          fileId8: fileId.slice(0, 8),
          source,
        });
        clearTabFileDirty(fileId);
        if (source === "toolbar" || source === "hotkey") {
          setMindMapSaveHint("内容与最新提交一致，无需保存");
          setStatus("已保存");
        }
        if (navigateAfter) {
          FileSyncState.clearLocalCache(fileId);
          finishNavigateHome();
        }
        return false;
      }
      const thumbnailForSave = thumbnail ?? (contentChanged ? null : undefined);

      if (source !== "visibility" && source !== "auto") {
        setMindMapSaving(true);
        setMindMapSaveHint(null);
      } else {
        visibilitySaveInFlightRef.current = true;
      }

      try {
        const result = await ServerSync.saveFileImmediate(
          fileId,
          document,
          getFileName(),
          thumbnailForSave,
          {
            suppressSavedEvent: true,
            archiveLabel: resolveAutoSaveArchiveLabel(source),
          },
        );
        updateDraftHashDebouncedRef.current.cancel();
        lastServerSaveMetaRef.current = {
          skipped: !!result?.skipped,
          contentSha256: result?.content_sha256 ?? null,
        };
        recordMindMapPersisted(fileId, document, {
          serverContentSha256: result?.content_sha256,
        });
        debugMindMapPersist("saveCurrentFileToServer success", {
          fileId8: fileId.slice(0, 8),
          source,
          skipped: !!result?.skipped,
          serverSha8: result?.content_sha256?.slice(0, 8) ?? null,
        });
        localStorage.removeItem(legacyMindMapCacheKey(fileId));
        window.dispatchEvent(
          new CustomEvent("excalidraw-server-saved", {
            detail: { id: fileId, hash },
          }),
        );
        window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
        window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
        if (source === "auto") {
          setMindMapSaveHint("自动保存完成");
        } else if (source === "toolbar" || source === "hotkey") {
          setMindMapSaveHint(result?.skipped ? "已是最新版本" : "已保存");
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
        if (source !== "visibility") {
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
        if (source !== "visibility" && source !== "auto") {
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
      setErrorMessage,
      setStatus,
    ],
  );

  useEffect(() => {
    saveToServerRef.current = saveCurrentFileToServer;
  }, [saveCurrentFileToServer]);

  useEffect(() => {
    return installExecutor(async (req) => {
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
      };
    });
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
      FileSyncState.setLocalCache(fileId, toMindMapLocalCacheRecord(document));
      if (isLocalDraftFileId(fileId)) {
        notifyLocalDraftEdited(fileId);
      }
    },
    [requestNativeMindMapData],
  );

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
      setMindMapHomeNavDialogOpen(true);
      return;
    }
    if (canSkipMindMapNativeSyncOnLeave(fileId)) {
      debugMindMapPersist("goHome skip native sync: already clean", {
        fileId8: fileId.slice(0, 8),
        draftHash16: FileSyncState.getDraftHash(fileId)?.slice(0, 16) ?? null,
        baselineHash8:
          FileSyncState.getBaselineHash(fileId)?.slice(0, 8) ?? null,
      });
      navigateToFileListHome();
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
      navigateToFileListHome();
      return;
    }
    if (autoSaveExit) {
      await requestSaveAndWait({ source: "home", navigateAfter: true });
      return;
    }
    setMindMapHomeNavDialogOpen(true);
  }, [navigateToFileListHome, syncCurrentMindMapDraftForLeave]);

  const mindMapHomeConfirmSave = useCallback(async () => {
    setMindMapHomeNavDialogOpen(false);
    await requestSaveAndWait({ source: "home", navigateAfter: true });
  }, []);

  const mindMapHomeConfirmDiscard = useCallback(async () => {
    const fileId = getFileIdFromHash();
    setMindMapHomeNavDialogOpen(false);
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

  const mindMapHomeDismissDialog = useCallback(() => {
    setMindMapHomeNavDialogOpen(false);
    clearAppShellPendingNavigation();
  }, []);

  return {
    mindMapSaving,
    mindMapSaveHint,
    mindMapHomeNavDialogOpen,
    markDocumentChanged,
    markNativeDocumentDirty,
    persistLocalDraftToCache,
    saveCurrentFileToServer,
    mindMapGoHomeWithServerSave,
    mindMapHomeConfirmSave,
    mindMapHomeConfirmDiscard,
    mindMapHomeDismissDialog,
    saveToServerRef,
    visibilitySaveInFlightRef,
    updateDraftHashDebouncedRef,
    skipLeaveStashOnceRef,
  };
}

export { MINDMAP_SAVE_TIMEOUT_MS };
