import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { isLocalDraftFileId } from "../data/localDraftFileId";
import { LocalDraftSessions } from "../data/localDraftSessions";
import { saveNewDocument } from "../data/saveNewDocument";
import { editorRegistry } from "../editors";

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
  const [navigateAfterSave, setNavigateAfterSave] = useState(false);

  const dismissSave = useCallback(() => {
    setSaveOpen(false);
    setNavigateAfterSave(false);
  }, []);

  const saveOverlayDismiss = useStrictOverlayDismiss(dismissSave);

  const openSaveDialog = useCallback((navigateAfter: boolean) => {
    setNavigateAfterSave(navigateAfter);
    setSaveOpen(true);
  }, []);

  const isLocalDraftOpen = useCallback(() => {
    const id = getFileId();
    return !!id && isLocalDraftFileId(id);
  }, [getFileId]);

  const getPresetFolderId = useCallback((): string | null | undefined => {
    const id = getFileId();
    if (!id || !isLocalDraftFileId(id)) {
      return undefined;
    }
    const meta = LocalDraftSessions.get(id);
    if (!meta || meta.folder_id === undefined) {
      return undefined;
    }
    return meta.folder_id;
  }, [getFileId]);

  const commitSave = useCallback(
    async (name: string, folderId: string | null) => {
      const draftId = getFileId();
      if (!draftId || !isLocalDraftFileId(draftId)) {
        return;
      }
      setSaveInFlight(true);
      try {
        await beforeSave?.();
        const kind = getDocumentKind();
        const { id, kind: savedKind } = await saveNewDocument({
          kind,
          name,
          folderId,
          draftId,
          excalidrawScene: getExcalidrawScene?.() ?? null,
          mindMapDocument: getMindMapDocument?.() ?? undefined,
          mindMapThumbnail: getMindMapThumbnail?.() ?? null,
        });
        setSaveOpen(false);
        onSaved?.(id, savedKind);
        if (navigateAfterSave) {
          navigateHome();
        } else {
          window.location.hash = editorRegistry.buildFileHash(id, savedKind);
          window.dispatchEvent(new CustomEvent("excalidraw-file-list-refresh"));
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : String(err ?? "保存失败");
        setErrorMessage?.(message);
      } finally {
        setSaveInFlight(false);
        setNavigateAfterSave(false);
      }
    },
    [
      beforeSave,
      getDocumentKind,
      getFileId,
      getExcalidrawScene,
      getMindMapDocument,
      getMindMapThumbnail,
      navigateAfterSave,
      navigateHome,
      onSaved,
      setErrorMessage,
    ],
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
  };
}
