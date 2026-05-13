import { useCallback, useEffect, useRef, useState } from "react";
import { debounce } from "@excalidraw/common";

import { FileSyncState } from "../data/FileSyncState";
import { MindMapAdapter } from "../data/formats/registry";
import { saveMindMapBrowserViewFromData } from "../data/mindMapBrowserViewStorage";
import { hashDocumentSnapshot } from "../data/sceneHash";
import { ServerSync } from "../data/ServerSync";
import { getFileIdFromHash } from "../data/fileIdFromHash";

import type { ManagedDocument } from "../data/documentTypes";
import type { MindMapDocumentData } from "../data/formats/MindMapAdapter";
import type { SaveToServerOptions, SaveToServerSource } from "./types";

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
}) {
  const {
    getCurrentDocument,
    requestNativeMindMapData,
    getFileName,
    navigateToFileListHome,
    setErrorMessage,
    setStatus,
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
      const hash = hashDocumentSnapshot(document);
      FileSyncState.setDraftHash(fileId, hash);
      const baseline = FileSyncState.getBaselineHash(fileId);
      if (!baseline || baseline === hash) {
        return;
      }
      FileSyncState.setLocalEditTime(fileId);
      FileSyncState.setLocalCache(fileId, toMindMapLocalCacheRecord(document));
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
      updateDraftHashDebouncedRef.current(fileId, () => document);
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

      if (source !== "visibility") {
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
        if (source === "toolbar" || source === "hotkey") {
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
        if (source !== "visibility") {
          setMindMapSaving(false);
        } else {
          visibilitySaveInFlightRef.current = false;
        }
      }
    },
    [
      finishNavigateHome,
      getFileName,
      persistLocalDraftToCache,
      requestNativeMindMapData,
      setErrorMessage,
      setStatus,
    ],
  );

  useEffect(() => {
    saveToServerRef.current = saveCurrentFileToServer;
  }, [saveCurrentFileToServer]);

  const mindMapGoHomeWithServerSave = useCallback(async () => {
    const fileId = getFileIdFromHash();
    if (!fileId) {
      navigateToFileListHome();
      return;
    }
    const nativeSave = await requestNativeMindMapData();
    if (nativeSave) {
      const { document } = nativeSave;
      updateDraftHashDebouncedRef.current.flush();
      const hash = hashDocumentSnapshot(document);
      FileSyncState.setDraftHash(fileId, hash);
      const baseline = FileSyncState.getBaselineHash(fileId);
      if (baseline && hash !== baseline) {
        FileSyncState.setLocalEditTime(fileId);
        FileSyncState.setLocalCache(fileId, toMindMapLocalCacheRecord(document));
      }
    }
    if (!FileSyncState.hasUnsavedChanges(fileId)) {
      navigateToFileListHome();
      return;
    }
    setMindMapHomeNavDialogOpen(true);
  }, [navigateToFileListHome, requestNativeMindMapData]);

  const mindMapHomeConfirmSave = useCallback(async () => {
    setMindMapHomeNavDialogOpen(false);
    await saveCurrentFileToServer({ source: "home", navigateAfter: true });
  }, [saveCurrentFileToServer]);

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
