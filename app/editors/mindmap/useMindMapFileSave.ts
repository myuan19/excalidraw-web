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
import { evaluateCurrentFileModificationState } from "../../data/fileModificationState";
import { clearMindMapDraftIfUnchanged } from "./mindMapDraftState";
import { isLocalDraftFileId } from "../../data/localDraftFileId";
import { notifyLocalDraftEdited } from "../../data/localDraftSessions";
import { discardLocalDraftSession } from "../../data/discardLocalDraftSession";
import { clearAppShellPendingNavigation } from "../../shell/appShellNavigate";
import {
  isAutoSaveEligibleFile,
  notifyEdit,
} from "../../data/autoSaveSession";
import { isAutoSaveOnExitActive } from "../../data/appSettings";
import { installExecutor, requestSaveAndWait } from "../../data/saveQueue";
import {
  matchesMindMapPersistedSnapshot,
  noteMindMapPersistedSnapshot,
} from "./mindMapPersistedSnapshot";

import type { ManagedDocument } from "../../data/documentTypes";
import type { MindMapDocumentData } from "../../data/formats/MindMapAdapter";
import type { SaveToServerOptions, SaveToServerSource } from "../../hooks/types";

type MindMapSaveDocument = ManagedDocument<MindMapDocumentData>;

export type MindMapNativeSaveResult = {
  document: MindMapSaveDocument;
  thumbnail?: string | null;
};

type RequestNativeMindMapData = () => Promise<MindMapNativeSaveResult | null>;

const MINDMAP_SAVE_TIMEOUT_MS = 8000;

function legacyMindMapCacheKey(fileId: string): string {
  return `mindmap-local-cache-${fileId}`;
}

function normalizeMindMapSaveDocument(
  document: MindMapSaveDocument,
): MindMapSaveDocument {
  return MindMapAdapter.toDocument(MindMapAdapter.migrate(document, 1));
}

export function toMindMapLocalCacheRecord(document: MindMapSaveDocument) {
  return {
    document: normalizeMindMapSaveDocument(document),
    elements: undefined,
    appState: undefined,
    files: {},
    deltas: [],
  };
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
    FileSyncState.setLocalCache(fileId, toMindMapLocalCacheRecord(document));
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
    const document = MindMapAdapter.toDocument(MindMapAdapter.migrate(parsed, 1));
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

  const updateDraftHashDebouncedRef = useRef(
    debounce((fileId: string, getDocument: () => MindMapSaveDocument | null) => {
      if (getFileIdFromHash() !== fileId) {
        return;
      }
      const document = getDocument();
      if (!document) {
        return;
      }
      const state = evaluateCurrentFileModificationState({
        fileId,
        kind: "mindmap",
        mindMapDocument: document,
      });
      const hash =
        state.modified
          ? (state.contentHash ?? hashDocumentSnapshot(document))
          : (state.baselineHash ?? state.contentHash ?? hashDocumentSnapshot(document));

      if (state.modified) {
        FileSyncState.setLocalCache(fileId, toMindMapLocalCacheRecord(document));
      }
      FileSyncState.setDraftHash(fileId, hash);
      if (!state.modified) {
        FileSyncState.clearLocalEditTime(fileId);
        if (isLocalDraftFileId(fileId)) {
          FileSyncState.clearLocalCache(fileId);
        }
        return;
      }
      FileSyncState.setLocalEditTime(fileId);
      if (isLocalDraftFileId(fileId)) {
        notifyLocalDraftEdited(fileId);
      }
    }, 450),
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
        updateDraftHashDebouncedRef.current.cancel();
        FileSyncState.alignHashes(fileId, hashDocumentSnapshot(document));
        FileSyncState.clearLocalEditTime(fileId);
        setStatus("");
        return;
      }
      if (clearMindMapDraftIfUnchanged(fileId, document)) {
        setStatus("");
        return;
      }
      updateDraftHashDebouncedRef.current(fileId, () => document);
      notifyEdit();
      setStatus("有未保存更改");
    },
    [setStatus],
  );

  const persistLocalDraftToCache = useCallback(
    async (forcedFileId?: string): Promise<boolean> => {
      const fileId = forcedFileId ?? getFileIdFromHash();
      updateDraftHashDebouncedRef.current.flush();
      if (!fileId) {
        return false;
      }
      const document = getCurrentDocument();
      if (!document || !FileSyncState.hasUnsavedChanges(fileId)) {
        return false;
      }
      FileSyncState.setLocalCache(fileId, toMindMapLocalCacheRecord(document));
      FileSyncState.setDraftHash(fileId, hashDocumentSnapshot(document));
      return true;
    },
    [getCurrentDocument],
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
      if (baseline && hash === baseline && !forceThumbnail) {
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
          thumbnail ?? undefined,
          { suppressSavedEvent: true },
        );
        if (result?.content_sha256) {
          FileSyncState.setServerHash(fileId, result.content_sha256);
        }
        noteMindMapPersistedSnapshot(fileId, document);
        updateDraftHashDebouncedRef.current.cancel();
        FileSyncState.setLocalCache(fileId, toMindMapLocalCacheRecord(document));
        FileSyncState.alignHashes(fileId, hashDocumentSnapshot(document));
        FileSyncState.clearLocalEditTime(fileId);
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
        if (source !== "visibility") {
          setErrorMessage(err?.message || "保存失败");
        }
        if (navigateAfter) {
          const okLocal = await persistLocalDraftToCache(fileId);
          if (okLocal) {
            window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
            window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
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
      const result = await saveCurrentFileToServer(req);
      const fid = getFileIdFromHash();
      return { saved: result, fileId: fid ?? undefined };
    });
  }, [saveCurrentFileToServer]);

  const syncCurrentMindMapDraftForLeave = useCallback(
    async (fileId: string) => {
      const nativeSave = await requestNativeMindMapData();
      if (!nativeSave) {
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
      const hash =
        state.modified
          ? (state.contentHash ?? hashDocumentSnapshot(document))
          : (state.baselineHash ?? state.contentHash ?? hashDocumentSnapshot(document));
      FileSyncState.setDraftHash(fileId, hash);
      if (!state.modified) {
        FileSyncState.clearLocalEditTime(fileId);
        FileSyncState.clearLocalCache(fileId);
        return;
      }
      FileSyncState.setLocalEditTime(fileId);
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
    await syncCurrentMindMapDraftForLeave(fileId);
    if (!shouldPromptEditorHomeNavDialog(fileId)) {
      navigateToFileListHome();
      return;
    }
    if (isAutoSaveOnExitActive() && isAutoSaveEligibleFile(fileId)) {
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
