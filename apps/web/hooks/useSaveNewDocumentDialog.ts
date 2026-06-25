import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  getLocalDraftPresetFolderIdForFile,
  shouldUseNativeSaveDialogForDraft,
} from "../data/localDraftSaveFolder";
import { isLocalDraftFileId } from "../data/localDraftFileId";
import { addMappedFolderRoot } from "../data/mappedFolderClient";
import {
  normalizeSaveBaseName,
  saveExtensionForKind,
  type DiskFolderPickResult,
} from "../components/saveDialogUtils";
import { saveNewDocument } from "../data/saveNewDocument";
import {
  clearThumbnailSavePending,
  markThumbnailSavePending,
} from "../data/thumbnailSavePending";
import { ServerSync, type ServerFile } from "../data/ServerSync";
import { devDebug } from "../lib/devDebug";
import { isDesktopEditorHub } from "../lib/runtimePlatform";
import {
  openEditorFileTab,
  replaceOpenFileTabAfterSave,
} from "../shell/editorTabNavigation";

function useStrictOverlayDismiss(onDismiss: () => void) {
  const armedRef = useRef(false);
  return useMemo(
    () => ({
      onPointerDown: (e: ReactPointerEvent) => {
        armedRef.current = e.target === e.currentTarget;
      },
      onPointerUp: (e: ReactPointerEvent) => {
        if (e.target === e.currentTarget && armedRef.current) {
          onDismiss();
        }
        armedRef.current = false;
      },
      onPointerCancel: () => {
        armedRef.current = false;
      },
    }),
    [onDismiss],
  );
}

function splitNativeSavePath(filePath: string): {
  folderPath: string;
  fileName: string;
} | null {
  const slash = Math.max(filePath.lastIndexOf("\\"), filePath.lastIndexOf("/"));
  if (slash <= 0 || slash >= filePath.length - 1) {
    return null;
  }
  return {
    folderPath: filePath.slice(0, slash),
    fileName: filePath.slice(slash + 1),
  };
}

export function useSaveNewDocumentDialog(opts: {
  getFileId: () => string | null;
  getDocumentKind: () => string;
  getDefaultName: () => string;
  getExcalidrawScene?: () => import("../data/forkFileTypes").ForkSceneSnapshot | null;
  getMindMapDocument?: () =>
    import("../data/documentTypes").ManagedDocument<
      import("../data/formats/MindMapAdapter").MindMapDocumentData
    > | null;
  getMindMapThumbnail?: () => string | null | undefined;
  beforeSave?: () => void | Promise<void>;
  onSaved?: (serverId: string, kind: string) => void;
  navigateHome: () => void;
  setErrorMessage?: (msg: string) => void;
}) {
  const {
    getFileId,
    getDocumentKind,
    getDefaultName,
    getExcalidrawScene,
    getMindMapDocument,
    getMindMapThumbnail,
    beforeSave,
    onSaved,
    navigateHome,
    setErrorMessage,
  } = opts;

  const [saveOpen, setSaveOpen] = useState(false);
  const [saveInFlight, setSaveInFlight] = useState(false);
  const [openLocalFolderBusy, setOpenLocalFolderBusy] = useState(false);
  const [navigateAfterSave, setNavigateAfterSave] = useState(false);
  const navigateAfterSaveRef = useRef(false);
  const nativeOverwriteFileRef = useRef<ServerFile | null>(null);
  const dismissSave = useCallback(() => {
    setSaveOpen(false);
    setNavigateAfterSave(false);
    navigateAfterSaveRef.current = false;
    nativeOverwriteFileRef.current = null;
  }, []);

  const saveOverlayDismiss = useStrictOverlayDismiss(dismissSave);

  const isLocalDraftOpen = useCallback(() => {
    const id = getFileId();
    return !!id && isLocalDraftFileId(id);
  }, [getFileId]);

  const getPresetFolderId = useCallback((): string | undefined => {
    return getLocalDraftPresetFolderIdForFile(getFileId());
  }, [getFileId]);

  const openLocalFolderForSave = useCallback(async (): Promise<
    DiskFolderPickResult | null
  > => {
    if (!isDesktopEditorHub()) {
      return null;
    }
    setOpenLocalFolderBusy(true);
    try {
      const result = await addMappedFolderRoot();
      if (!result?.folder?.id) {
        return null;
      }
      window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
      return {
        folderId: result.folder.id,
        absPath: result.mappingRoot.absPath,
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : String(err ?? "添加本地目录失败");
      setErrorMessage?.(message);
      return null;
    } finally {
      setOpenLocalFolderBusy(false);
    }
  }, [setErrorMessage]);

  const commitSave = useCallback(
    async (name: string, folderId: string | null) => {
      const draftId = getFileId();
      if (!draftId || !isLocalDraftFileId(draftId)) {
        devDebug("api-sync", "commitSave | skipped not local-draft", {
          draftId8: draftId?.slice(0, 20) ?? null,
        });
        return;
      }
      const presetFolderId = getLocalDraftPresetFolderIdForFile(draftId);
      const resolvedFolderId = presetFolderId ?? folderId;
      if (!resolvedFolderId) {
        setErrorMessage?.("请选择保存位置");
        return;
      }
      const shouldNavigateHome = navigateAfterSaveRef.current;
      setSaveInFlight(true);
      markThumbnailSavePending([draftId]);
      devDebug("api-sync", "commitSave | start", {
        draftId8: draftId.slice(0, 20),
        name,
        folderId: resolvedFolderId,
        kind: getDocumentKind(),
      });
      try {
        await beforeSave?.();
        const kind = getDocumentKind();
        const { id, kind: savedKind } = await saveNewDocument({
          kind,
          name,
          folderId: resolvedFolderId,
          draftId,
          excalidrawScene: getExcalidrawScene?.() ?? null,
          mindMapDocument: getMindMapDocument?.() ?? undefined,
          mindMapThumbnail: getMindMapThumbnail?.() ?? null,
          overwriteFile: nativeOverwriteFileRef.current,
        });
        devDebug("api-sync", "commitSave | ok", {
          id8: id.slice(0, 8),
          savedKind,
          navigateAfterSave: shouldNavigateHome,
        });
        setSaveOpen(false);
        replaceOpenFileTabAfterSave({
          fromFileId: draftId,
          toFileId: id,
          kind: savedKind,
          title: name,
        });
        onSaved?.(id, savedKind);
        if (shouldNavigateHome) {
          navigateHome();
        } else {
          void openEditorFileTab({
            fileId: id,
            kind: savedKind,
            title: name,
          });
          window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : String(err ?? "保存失败");
        devDebug("api-sync", "commitSave | failed", { message });
        setSaveOpen(false);
        setErrorMessage?.(message);
      } finally {
        clearThumbnailSavePending([draftId]);
        setSaveInFlight(false);
        setNavigateAfterSave(false);
        navigateAfterSaveRef.current = false;
        nativeOverwriteFileRef.current = null;
      }
    },
    [
      beforeSave,
      getDocumentKind,
      getFileId,
      getExcalidrawScene,
      getMindMapDocument,
      getMindMapThumbnail,
      navigateHome,
      onSaved,
      setErrorMessage,
    ],
  );

  const openNativeSaveDialogForDraft = useCallback(
    async (navigateAfter: boolean) => {
      if (!window.editorHubDesktop?.showSaveDialog) {
        setErrorMessage?.("当前环境不支持系统保存对话框");
        return;
      }
      const kind = getDocumentKind();
      const extension = saveExtensionForKind(kind);
      try {
        const filePath = await window.editorHubDesktop.showSaveDialog({
          title: "保存文件",
          defaultName: getDefaultName(),
          extension,
        });
        if (!filePath) {
          return;
        }
        const nativeTarget = splitNativeSavePath(filePath);
        if (!nativeTarget) {
          setErrorMessage?.("无法解析保存路径");
          return;
        }
        const result = await addMappedFolderRoot({
          absPath: nativeTarget.folderPath,
        });
        if (!result?.folder?.id) {
          setErrorMessage?.("请选择保存位置");
          return;
        }
        const overwriteFile = await ServerSync.resolveCatalogFileByPath(
          filePath,
        )
          .then((resolved) => resolved.file)
          .catch(() => null);
        window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
        navigateAfterSaveRef.current = navigateAfter;
        nativeOverwriteFileRef.current = overwriteFile;
        setNavigateAfterSave(navigateAfter);
        await commitSave(
          normalizeSaveBaseName(nativeTarget.fileName, extension),
          result.folder.id,
        );
      } catch (err: unknown) {
        setErrorMessage?.(
          err instanceof Error ? err.message : String(err ?? "保存失败"),
        );
      }
    },
    [commitSave, getDefaultName, getDocumentKind, setErrorMessage],
  );

  const openSaveDialog = useCallback(
    (navigateAfter: boolean) => {
      navigateAfterSaveRef.current = navigateAfter;
      setNavigateAfterSave(navigateAfter);
      if (
        isDesktopEditorHub() &&
        isLocalDraftOpen() &&
        shouldUseNativeSaveDialogForDraft(getFileId())
      ) {
        void openNativeSaveDialogForDraft(navigateAfter);
        return;
      }
      setSaveOpen(true);
    },
    [getPresetFolderId, isLocalDraftOpen, openNativeSaveDialogForDraft],
  );

  return {
    saveOpen,
    saveInFlight,
    saveOverlayDismiss,
    dismissSave,
    openSaveDialog,
    commitSave,
    isLocalDraftOpen,
    presetFolderId: getPresetFolderId,
    defaultSaveName: getDefaultName,
    allowOpenLocalFolder: isDesktopEditorHub(),
    openLocalFolderBusy,
    openLocalFolderForSave,
  };
}
