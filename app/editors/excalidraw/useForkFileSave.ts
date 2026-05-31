import { useCallback, useEffect, useRef, useState } from "react";
import { debounce } from "@excalidraw/common";

import { createLogger } from "../../lib/logger";
import { DeltaStorage } from "../../data/DeltaStorage";
import { FileEditDirty } from "../../data/fileEditDirty";
import { discardLocalEditsNavigateHome } from "../../data/fileEditSession";
import { FileSyncState } from "../../data/FileSyncState";
import { hashSceneSnapshot } from "../../data/sceneHash";
import { LocalData } from "../../data/LocalData";
import {
  generateExcalidrawThumbnailAndCache,
  scheduleExcalidrawThumbnailAndCache,
} from "../../data/excalidrawThumbnail";
import { resolveSaveDisplayName } from "../../data/forkFileNaming";
import { ServerSync } from "../../data/ServerSync";
import { getFileIdFromHash } from "../../data/fileIdFromHash";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { SaveToServerOptions, SaveToServerSource, SceneData } from "../../hooks/types";

const logHook = createLogger({ module: "hook.fileSave" });
const logStash = createLogger({ module: "stash" });
const logHash = createLogger({ module: "hash" });
const logSave = createLogger({ module: "save" });

export function useForkFileSave(opts: {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  getSceneDataRef: React.MutableRefObject<() => SceneData | null>;
  navigateToFileListHome: () => void;
  setErrorMessage: (msg: string) => void;
}) {
  const { excalidrawAPI, getSceneDataRef, navigateToFileListHome, setErrorMessage } = opts;
  const getSceneData = () => getSceneDataRef.current();

  const [forkSaving, setForkSaving] = useState(false);
  const [forkSaveHint, setForkSaveHint] = useState<string | null>(null);
  const [forkHomeNavDialogOpen, setForkHomeNavDialogOpen] = useState(false);

  const skipLeaveStashOnceRef = useRef(false);
  const saveToServerRef = useRef<
    (opts?: SaveToServerOptions) => Promise<boolean>
  >(() => Promise.resolve(false));
  const visibilitySaveInFlightRef = useRef(false);
  const localPersistGenRef = useRef(0);

  const updateDraftHashDebouncedRef = useRef(
    debounce(
      (fileId: string, getScene: () => SceneData | null) => {
        if (getFileIdFromHash() !== fileId) {
          return;
        }
        const sceneData = getScene();
        if (!sceneData || !fileId) {
          return;
        }
        const h = hashSceneSnapshot(sceneData);
        FileSyncState.setDraftHash(fileId, h);
        window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));

        const baseline = FileSyncState.getBaselineHash(fileId);
        if (!baseline || h === baseline) {
          localPersistGenRef.current += 1;
          return;
        }

        FileSyncState.setLocalEditTime(fileId);

        const myGen = ++localPersistGenRef.current;
        void (async () => {
          try {
            const deltas = await DeltaStorage.getAllPersistedDtos();
            if (myGen !== localPersistGenRef.current) {
              return;
            }
            const latest = getScene();
            if (!latest || !fileId) {
              return;
            }
            const h2 = hashSceneSnapshot(latest);
            const b2 = FileSyncState.getBaselineHash(fileId);
            if (!b2 || h2 === b2) {
              return;
            }
            FileSyncState.setLocalCache(fileId, {
              elements: latest.elements,
              appState: latest.appState,
              files: latest.files,
              deltas,
            });
            scheduleExcalidrawThumbnailAndCache(fileId, latest);
          } catch {
            // quota / idb
          }
        })();
      },
      450,
    ),
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
      logStash.debug(`persistLocalDraft enter ${fid.slice(0, 8)} unsaved=${hasUnsaved}`);
      if (!hasUnsaved) {
        logStash.debug(`persistLocalDraft skip ${fid.slice(0, 8)}: no unsaved changes`);
        return false;
      }
      const sceneData = getSceneData();
      if (!sceneData) {
        logStash.debug(`persistLocalDraft skip ${fid.slice(0, 8)}: no sceneData`);
        return false;
      }
      const deltas = await DeltaStorage.getAllPersistedDtos();
      FileSyncState.setLocalCache(fid, {
        elements: sceneData.elements,
        appState: sceneData.appState,
        files: sceneData.files,
        deltas,
      });
      const localAfterWrite = FileSyncState.getLocalCache(fid);
      const localAfterWriteElements = Array.isArray(localAfterWrite?.elements)
        ? localAfterWrite.elements.length
        : 0;
      const dh = hashSceneSnapshot(sceneData);
      FileSyncState.setDraftHash(fid, dh);
      logSave.debug(
        `persistLocalDraft file=${fid.slice(0, 8)}, draftHash=${dh.slice(0, 8)}, elements=${sceneData.elements.length}, localCacheElements=${localAfterWriteElements}`,
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
      updateDraftHashDebouncedRef.current.flush();
      localPersistGenRef.current += 1;
      const sceneData = getSceneData();
      if (!sceneData) {
        if (navigateAfter) {
          finishNavigateHome();
        }
        return false;
      }
      const h = hashSceneSnapshot(sceneData);
      const baseline = FileSyncState.getBaselineHash(fid);
      if (baseline && h === baseline) {
        if (source === "toolbar" || source === "hotkey") {
          setForkSaveHint("内容与最新提交一致，无需保存");
        }
        if (navigateAfter) {
          FileSyncState.clearLocalCache(fid);
          finishNavigateHome();
        }
        return false;
      }
      if (source !== "visibility") {
        setForkSaving(true);
      } else {
        visibilitySaveInFlightRef.current = true;
      }
      if (source === "toolbar" || source === "home" || source === "hotkey") {
        setForkSaveHint(null);
      }
      try {
        const nameForPut = await resolveSaveDisplayName(fid, sceneData.appState);
        const thumbnail = await generateExcalidrawThumbnailAndCache(fid, sceneData);
        logSave.debug(
          `saveToServer file=${fid.slice(0, 8)}, name=${nameForPut}, hasThumb=${!!thumbnail}, elements=${sceneData.elements.length}, source=${source}`,
        );
        const result = await ServerSync.saveFileImmediate(
          fid,
          sceneData,
          nameForPut,
          thumbnail,
          { suppressSavedEvent: true },
        );
        logSave.debug(`saveToServer file=${fid.slice(0, 8)}, result`, result);
        const deltasAfterSave = await DeltaStorage.getAllPersistedDtos();
        FileSyncState.setLocalCache(fid, {
          elements: sceneData.elements,
          appState: sceneData.appState,
          files: sceneData.files,
          deltas: deltasAfterSave,
        });

        if (result?.content_sha256) {
          FileSyncState.setServerHash(fid, result.content_sha256);
        }
        updateDraftHashDebouncedRef.current.cancel();
        localPersistGenRef.current += 1;
        const hAfter = hashSceneSnapshot(getSceneData() ?? sceneData);
        FileSyncState.alignHashes(fid, hAfter);
        FileSyncState.clearLocalEditTime(fid);
        logHash.debug(
          `saveToServer done file=${fid.slice(0, 8)}, baseline=draft=${hAfter.slice(0, 8)}, serverSha=${result?.content_sha256?.slice(0, 8) ?? "none"}`,
        );

        logHook.info("save complete", { fileId: fid.slice(0, 8), source, hash: hAfter.slice(0, 8) });
        window.dispatchEvent(
          new CustomEvent("excalidraw-server-saved", {
            detail: { id: fid, hash: hAfter },
          }),
        );
        window.dispatchEvent(new CustomEvent("excalidraw-file-sync-state"));
        window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
        if (result?.skipped) {
          if (source === "toolbar" || source === "hotkey") {
            setForkSaveHint("已是最新版本");
          }
        } else if (source === "visibility") {
          excalidrawAPI.setToast({ message: "切换到后台时已保存到服务器" });
        } else if (source === "hotkey" || source === "toolbar") {
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
            window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
            excalidrawAPI.setToast({ message: "无法上传到服务器，已暂存到本机并返回" });
          }
          finishNavigateHome();
        }
        return false;
      } finally {
        if (source !== "visibility") {
          setForkSaving(false);
        } else {
          visibilitySaveInFlightRef.current = false;
        }
      }
    },
    [excalidrawAPI, getSceneData, finishNavigateHome, persistLocalDraftToCache, setErrorMessage],
  );

  useEffect(() => {
    saveToServerRef.current = saveCurrentFileToServer;
  }, [saveCurrentFileToServer]);

  const discardLocalEditsForHomeNavigation = useCallback(async () => {
    await discardLocalEditsNavigateHome({
      getFileId: () => getFileIdFromHash(),
      flushDraftDebounce: () => updateDraftHashDebouncedRef.current.flush(),
      bumpPersistGeneration: () => {
        localPersistGenRef.current += 1;
      },
      navigateToFileListHome,
    });
  }, [navigateToFileListHome]);

  const forkGoHomeWithServerSave = useCallback(async () => {
    const fid = getFileIdFromHash();
    if (!excalidrawAPI || !fid) {
      navigateToFileListHome();
      return;
    }
    FileEditDirty.prepareForDirtyEvaluation({
      flushEmbeddedLocalFiles: () => LocalData.flushSave(),
      draftFlusher: updateDraftHashDebouncedRef.current,
    });
    if (!FileEditDirty.hasUnsavedChanges(fid)) {
      navigateToFileListHome();
      return;
    }
    setForkHomeNavDialogOpen(true);
  }, [excalidrawAPI, navigateToFileListHome]);

  const forkHomeConfirmSave = useCallback(async () => {
    setForkHomeNavDialogOpen(false);
    await saveCurrentFileToServer({ source: "home", navigateAfter: true });
  }, [saveCurrentFileToServer]);

  const forkHomeConfirmDiscard = useCallback(async () => {
    setForkHomeNavDialogOpen(false);
    await discardLocalEditsForHomeNavigation();
  }, [discardLocalEditsForHomeNavigation]);

  const forkHomeDismissDialog = useCallback(() => {
    setForkHomeNavDialogOpen(false);
  }, []);

  return {
    forkSaving,
    forkSaveHint,
    forkHomeNavDialogOpen,
    saveCurrentFileToServer,
    persistLocalDraftToCache,
    forkGoHomeWithServerSave,
    forkHomeConfirmSave,
    forkHomeConfirmDiscard,
    forkHomeDismissDialog,
    saveToServerRef,
    visibilitySaveInFlightRef,
    localPersistGenRef,
    updateDraftHashDebouncedRef,
    skipLeaveStashOnceRef,
  };
}
